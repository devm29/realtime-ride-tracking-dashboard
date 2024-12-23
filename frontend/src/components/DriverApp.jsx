import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { NYC_BOUNDS, formatCoord } from '../geo';
import './DriverApp.css';

const UPDATE_INTERVAL_MS = 10000;
const STEP_DEGREES = 0.004;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round6 = (value) => Number(value.toFixed(6));

// The browser has no real GPS fix in this demo, so the "car" starts somewhere in the city
// and drifts a few hundred metres per update instead of jumping across town.
function nextPosition(previous) {
  if (!previous) {
    return {
      lat: round6(NYC_BOUNDS.south + Math.random() * (NYC_BOUNDS.north - NYC_BOUNDS.south)),
      lng: round6(NYC_BOUNDS.west + Math.random() * (NYC_BOUNDS.east - NYC_BOUNDS.west))
    };
  }
  return {
    lat: round6(clamp(previous.lat + (Math.random() - 0.5) * 2 * STEP_DEGREES, NYC_BOUNDS.south, NYC_BOUNDS.north)),
    lng: round6(clamp(previous.lng + (Math.random() - 0.5) * 2 * STEP_DEGREES, NYC_BOUNDS.west, NYC_BOUNDS.east))
  };
}

function DriverApp() {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [driverProfile, setDriverProfile] = useState(null);
  const [token, setToken] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('offline');

  const socketRef = useRef(null);
  const locationIntervalRef = useRef(null);
  const positionRef = useRef(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const response = await axios.post('/api/login', credentials);

      if (response.data.profile?.role !== 'driver') {
        setError('Only driver accounts can share a location.');
      } else {
        setToken(response.data.token);
        setDriverProfile(response.data.profile);
        setStatus('online');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
  };

  const sendPosition = (socket) => {
    positionRef.current = nextPosition(positionRef.current);
    socket.emit('location_update', positionRef.current);
  };

  const startSharing = () => {
    if (!token) return;

    setError('');
    setIsSharing(true);
    setStatus('connecting');

    const socket = io('/driver/update', { auth: { token } });
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('sharing');
    });

    socket.on('location_updated', (data) => {
      setCurrentLocation({ ...data.location, timestamp: data.timestamp });
    });

    socket.on('error', (err) => {
      setError(err.message);
    });

    socket.on('connect_error', (err) => {
      setError(`Could not connect: ${err.message}`);
      setStatus('offline');
    });

    // One channel is enough: every update used to go out over the socket and REST.
    locationIntervalRef.current = setInterval(() => sendPosition(socket), UPDATE_INTERVAL_MS);
    sendPosition(socket);
  };

  // Disconnecting takes the driver offline server-side; the session stays valid so sharing can restart.
  const stopSharing = () => {
    setIsSharing(false);
    setStatus('online');

    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };

  const handleLogout = async () => {
    if (isSharing) {
      stopSharing();
    }

    await axios.post('/api/logout', {}, {
      headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {});

    setDriverProfile(null);
    setToken('');
    setCurrentLocation(null);
    positionRef.current = null;
    setStatus('offline');
    setCredentials({ username: '', password: '' });
  };

  useEffect(() => {
    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  if (!driverProfile) {
    return (
      <div className="driver-app">
        <form onSubmit={handleLogin} className="panel driver-card" aria-labelledby="driver-login-title">
          <p className="eyebrow">Driver app</p>
          <h1 id="driver-login-title">Go on shift</h1>
          <p className="lede">Sign in to share your position with dispatch.</p>

          {error && <div className="alert alert-error" role="alert">{error}</div>}

          <label htmlFor="driver-username">Username</label>
          <input
            id="driver-username"
            type="text"
            autoComplete="username"
            value={credentials.username}
            onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
            placeholder="driver1"
            required
          />

          <label htmlFor="driver-password">Password</label>
          <input
            id="driver-password"
            type="password"
            autoComplete="current-password"
            value={credentials.password}
            onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
            placeholder="password1"
            required
          />

          <button type="submit" className="btn btn-primary">Sign in as driver</button>

          <p className="demo-note">
            Demo drivers: <code>driver1</code>, <code>driver2</code>, <code>driver3</code> with
            passwords <code>password1</code> to <code>password3</code>.
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="driver-app">
      <section className="panel driver-card" aria-labelledby="driver-name">
        <div className="driver-head">
          <div>
            <p className="eyebrow">On shift</p>
            <h1 id="driver-name">{driverProfile.name}</h1>
          </div>
          <span className={`status-pill status-${status === 'sharing' ? 'connected' : 'idle'}`} role="status">
            <span className="status-dot" aria-hidden="true" />
            {status === 'sharing' ? 'Sharing' : status === 'connecting' ? 'Connecting' : 'Not sharing'}
          </span>
        </div>

        <dl className="detail-list">
          <div><dt>Vehicle</dt><dd>{driverProfile.vehicle}</dd></div>
          <div><dt>Plate</dt><dd className="mono">{driverProfile.license}</dd></div>
        </dl>

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        {!isSharing ? (
          <button type="button" onClick={startSharing} className="btn btn-primary btn-large">
            Start sharing location
          </button>
        ) : (
          <button type="button" onClick={stopSharing} className="btn btn-secondary btn-large">
            Stop sharing location
          </button>
        )}

        <div className="fix" aria-live="polite">
          <h2>Last fix</h2>
          {currentLocation ? (
            <dl className="detail-list">
              <div><dt>Latitude</dt><dd className="mono">{formatCoord(currentLocation.lat)}</dd></div>
              <div><dt>Longitude</dt><dd className="mono">{formatCoord(currentLocation.lng)}</dd></div>
              <div><dt>Sent</dt><dd className="mono">{new Date(currentLocation.timestamp).toLocaleTimeString()}</dd></div>
            </dl>
          ) : (
            <p className="empty">No position sent yet. Positions go out every 10 seconds while sharing.</p>
          )}
        </div>

        <button type="button" onClick={handleLogout} className="btn btn-ghost">Sign out</button>
      </section>
    </div>
  );
}

export default DriverApp;
