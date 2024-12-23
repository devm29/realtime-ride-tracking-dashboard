// The service area the backend simulates in (src/config/config.js nycBounds).
export const NYC_BOUNDS = { north: 40.9176, south: 40.4774, east: -73.7004, west: -74.2591 };

// Width/height of the map in SVG units. One degree of longitude is shorter than one of
// latitude at 40.7°N (cos 40.7° ≈ 0.758), so the box is slightly taller than wide.
export const MAP_WIDTH = 962;
export const MAP_HEIGHT = 1000;

export function project(lat, lng, bounds = NYC_BOUNDS) {
  return {
    x: ((lng - bounds.west) / (bounds.east - bounds.west)) * MAP_WIDTH,
    y: ((bounds.north - lat) / (bounds.north - bounds.south)) * MAP_HEIGHT
  };
}

// Fixed reference points so positions read as places, drawn locally with no tile service.
export const LANDMARKS = [
  { name: 'Times Sq', lat: 40.758, lng: -73.9855 },
  { name: 'Downtown Bklyn', lat: 40.6928, lng: -73.9903 },
  { name: 'JFK', lat: 40.6413, lng: -73.7781 },
  { name: 'LaGuardia', lat: 40.7769, lng: -73.874 },
  { name: 'Bronx Zoo', lat: 40.8506, lng: -73.8769 },
  { name: 'St. George', lat: 40.6437, lng: -74.0736 },
  { name: 'Newark Bay', lat: 40.68, lng: -74.14 }
];

export function formatCoord(value) {
  return typeof value === 'number' ? value.toFixed(5) : '—';
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}
