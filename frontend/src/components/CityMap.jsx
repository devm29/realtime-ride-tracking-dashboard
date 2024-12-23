import { LANDMARKS, MAP_HEIGHT, MAP_WIDTH, NYC_BOUNDS, initials, project } from '../geo';
import './CityMap.css';

// Work in hundredths of a degree so the loop does not accumulate float error.
const GRID_STEP = 5;
const LABEL_STEP = 10;

function gridLines() {
  const lines = [];
  for (let c = Math.ceil(NYC_BOUNDS.south * 100 / GRID_STEP) * GRID_STEP; c < NYC_BOUNDS.north * 100; c += GRID_STEP) {
    const { y } = project(c / 100, NYC_BOUNDS.west);
    const label = c % LABEL_STEP === 0 ? `${(c / 100).toFixed(1)}°N` : null;
    lines.push({ key: `lat${c}`, x1: 0, y1: y, x2: MAP_WIDTH, y2: y, label, lx: 10, ly: y - 8 });
  }
  for (let c = Math.ceil(NYC_BOUNDS.west * 100 / GRID_STEP) * GRID_STEP; c < NYC_BOUNDS.east * 100; c += GRID_STEP) {
    const { x } = project(NYC_BOUNDS.north, c / 100);
    const label = c % LABEL_STEP === 0 ? `${Math.abs(c / 100).toFixed(1)}°W` : null;
    lines.push({ key: `lng${c}`, x1: x, y1: 0, x2: x, y2: MAP_HEIGHT, label, lx: x + 8, ly: MAP_HEIGHT - 12 });
  }
  return lines;
}

const GRID = gridLines();

/**
 * Schematic plot of the service area: a lat/lng graticule, a few landmarks and one marker per
 * online driver with a short trail. Drawn entirely from local data.
 */
function CityMap({ drivers, selectedDriverId, onSelect }) {
  return (
    <figure className="city-map">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="img"
        aria-label={`Schematic map of New York City with ${drivers.length} driver${drivers.length === 1 ? '' : 's'} online`}
      >
        <rect className="map-bg" width={MAP_WIDTH} height={MAP_HEIGHT} />
        {GRID.map((line) => (
          <g key={line.key}>
            <line className="map-grid" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
            {line.label && <text className="map-grid-label" x={line.lx} y={line.ly}>{line.label}</text>}
          </g>
        ))}

        {LANDMARKS.map((landmark) => {
          const { x, y } = project(landmark.lat, landmark.lng);
          return (
            <g key={landmark.name} className="map-landmark">
              <rect x={x - 5} y={y - 5} width="10" height="10" transform={`rotate(45 ${x} ${y})`} />
              <text x={x + 12} y={y + 5}>{landmark.name}</text>
            </g>
          );
        })}

        {drivers.filter((driver) => driver.location).map((driver) => {
          const { x, y } = project(driver.location.lat, driver.location.lng);
          const selected = driver.driverId === selectedDriverId;
          const trail = driver.trail.map((point) => {
            const p = project(point.lat, point.lng);
            return `${p.x},${p.y}`;
          }).join(' ');
          const name = driver.profile?.name || driver.driverId;

          return (
            <g
              key={driver.driverId}
              className={`map-driver${selected ? ' is-selected' : ''}`}
              onClick={() => onSelect(driver.driverId)}
            >
              {driver.trail.length > 1 && <polyline className="map-trail" points={trail} />}
              {selected && <circle className="map-driver-ring" cx={x} cy={y} r="30" />}
              <circle className="map-driver-dot" cx={x} cy={y} r={selected ? 20 : 16} />
              <text className="map-driver-initials" x={x} y={y + 5}>{initials(name)}</text>
              <title>{name}</title>
            </g>
          );
        })}
      </svg>
      <figcaption>Schematic view, not to street scale. Grid every 0.05°, labels every 0.1°.</figcaption>
    </figure>
  );
}

export default CityMap;
