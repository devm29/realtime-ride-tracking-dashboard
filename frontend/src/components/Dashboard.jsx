import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import CityMap from './CityMap';
import { formatCoord } from '../geo';
import './Dashboard.css';

const TRAIL_LENGTH = 12;

const STATUS_LABELS = {
  connecting: 'Connecting',
  connected: 'Live',
  disconnected: 'Reconnecting',
  error: 'Offline'
};

function formatTime(timestamp) {
  if (!timestamp) return 'Never';
  return new Date(timestamp).toLocaleTimeString();
}

/** Merges a position into the roster entry, keeping a short trail for the map. */
function withPosition(entry, location, timestamp) {
  const trail = [...(entry.trail || []), location].slice(-TRAIL_LENGTH);
  return { ...entry, location, lastSeen: timestamp, trail };
}

function Dashboard({ user, onLogout }) {
  const [drivers, setDrivers] = useState({});
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedDriverData, setSelectedDriverData] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState([]);

  const socketRef = useRef(null);
  const selectedDriverIdRef = useRef('');

  const addNotification = useCallback((message, type = 'info') => {
    const notification = {
      id: `${Date.now()}-${Math.random()}`,
      message,
      type,
      timestamp: new Date().toISOString()
    };

    setNotifications((prev) => [notification, ...prev.slice(0, 3)]);

    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    }, 5000);
  }, []);

  useEffect(() => {
    const socket = io('/dashboard', {
      transports: ['websocket', 'polling'],
      auth: { token: user.token }
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnectionStatus('connected');
      setError('');
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
      setError('Connection lost. Attempting to reconnect…');
    });

    socket.on('connect_error', (err) => {
      setConnectionStatus('error');
      setError(/token|not allowed/i.test(err.message)
        ? 'Your session has expired. Please sign in again.'
        : 'Failed to connect to server. Please check your connection.');
    });

    socket.on('online_drivers', (data) => {
      setDrivers((prev) => {
        const next = {};
        for (const driver of data.drivers || []) {
          const previous = prev[driver.driverId] || { trail: [] };
          const moved = driver.location && previous.location?.lat !== driver.location.lat;
          next[driver.driverId] = moved
            ? withPosition({ ...previous, ...driver }, driver.location, driver.lastSeen)
            : { ...previous, ...driver, location: driver.location || previous.location };
        }
        return next;
      });
    });

    socket.on('driver_location_update', (data) => {
      setDrivers((prev) => ({
        ...prev,
        [data.driverId]: withPosition(
          { ...(prev[data.driverId] || { trail: [] }), driverId: data.driverId, profile: data.profile },
          data.location,
          data.timestamp
        )
      }));
    });

    socket.on('driver_data', (data) => {
      setSelectedDriverData(data);
      setError('');
    });

    socket.on('driver_offline', (data) => {
      setSelectedDriverData(null);
      addNotification(`Driver ${data.driverId} is offline`, 'warning');
    });

    socket.on('OFFLINE_DRIVER', (data) => {
      addNotification(`${data.driverId} has sent no position recently`, 'error');
    });

    socket.on('error', (data) => {
      setError(data.message || 'An error occurred');
    });

    socket.on('driver_disconnected', (data) => {
      addNotification(`${data.profile?.name || data.driverId} went offline`, 'warning');
      setDrivers((prev) => {
        const next = { ...prev };
        delete next[data.driverId];
        return next;
      });

      // A ref, not state: this handler is registered once and would otherwise see a stale id.
      if (selectedDriverIdRef.current === data.driverId) {
        selectedDriverIdRef.current = '';
        setSelectedDriverData(null);
        setSelectedDriverId('');
      }
    });

    socket.on('driver_connected', (data) => {
      addNotification(`${data.profile?.name || data.driverId} came online`, 'success');
    });

    return () => {
      socket.disconnect();
    };
  }, [addNotification, user.token]);

  const handleDriverSelection = (driverId) => {
    const socket = socketRef.current;
    if (!socket || driverId === selectedDriverIdRef.current) return;

    if (selectedDriverIdRef.current) {
      socket.emit('unsubscribe');
    }

    selectedDriverIdRef.current = driverId;
    setSelectedDriverId(driverId);
    setSelectedDriverData(null);
    setError('');

    if (driverId) {
      socket.emit('subscribe', { driverId });
    }
  };

  const roster = Object.values(drivers).sort((a, b) =>
    (a.profile?.name || a.driverId).localeCompare(b.profile?.name || b.driverId));
  const selected = drivers[selectedDriverId];
  const detail = selectedDriverData || (selected && {
    profile: selected.profile,
    location: { ...selected.location, timestamp: selected.lastSeen },
    isOnline: true
  });

  return (
    <div className="dashboard">
      <header className="dash-bar">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Ride Tracker <span className="brand-sub">Dispatch</span>
        </span>
        <div className="dash-bar-meta">
          <span className={`status-pill status-${connectionStatus}`} role="status">
            <span className="status-dot" aria-hidden="true" />
            {STATUS_LABELS[connectionStatus]}
          </span>
          <span className="dash-user">{user.profile?.name || user.username}</span>
          <button type="button" className="btn btn-ghost" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      {error && <div className="alert alert-error dash-alert" role="alert">{error}</div>}

      <main className="dash-grid">
        <section className="panel roster" aria-labelledby="roster-title">
          <div className="panel-head">
            <h2 id="roster-title">On shift</h2>
            <span className="count" aria-label={`${roster.length} drivers online`}>{roster.length}</span>
          </div>

          {connectionStatus === 'connecting' ? (
            <p className="empty">Connecting to the dispatch feed…</p>
          ) : roster.length === 0 ? (
            <div className="empty">
              <p>No drivers online.</p>
              <p className="hint">Sign in on the Driver app, or run <code>npm run simulate</code>.</p>
            </div>
          ) : (
            <ul className="roster-list">
              {roster.map((driver) => (
                <li key={driver.driverId}>
                  <button
                    type="button"
                    className="roster-item"
                    aria-pressed={driver.driverId === selectedDriverId}
                    onClick={() => handleDriverSelection(driver.driverId)}
                  >
                    <span className="roster-name">{driver.profile?.name || driver.driverId}</span>
                    <span className="roster-vehicle">{driver.profile?.vehicle || 'Unknown vehicle'}</span>
                    <span className="roster-seen">Seen {formatTime(driver.lastSeen)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="map-panel" aria-label="Driver map">
          <CityMap drivers={roster} selectedDriverId={selectedDriverId} onSelect={handleDriverSelection} />
        </section>

        <section className="panel detail" aria-labelledby="detail-title" aria-live="polite">
          <div className="panel-head">
            <h2 id="detail-title">Tracking</h2>
          </div>
          {!selectedDriverId ? (
            <p className="empty">Select a driver on the roster or the map.</p>
          ) : !detail ? (
            <p className="empty">Waiting for {selectedDriverId}'s next position…</p>
          ) : (
            <dl className="detail-list">
              <div><dt>Driver</dt><dd>{detail.profile?.name || selectedDriverId}</dd></div>
              <div><dt>Vehicle</dt><dd>{detail.profile?.vehicle || 'Unknown'}</dd></div>
              <div><dt>Plate</dt><dd className="mono">{detail.profile?.license || '—'}</dd></div>
              <div><dt>Latitude</dt><dd className="mono">{formatCoord(detail.location?.lat)}</dd></div>
              <div><dt>Longitude</dt><dd className="mono">{formatCoord(detail.location?.lng)}</dd></div>
              <div><dt>Last fix</dt><dd className="mono">{formatTime(detail.location?.timestamp)}</dd></div>
              <div>
                <dt>Status</dt>
                <dd className={detail.isOnline ? 'is-online' : 'is-offline'}>{detail.isOnline ? 'Online' : 'Offline'}</dd>
              </div>
            </dl>
          )}
        </section>
      </main>

      <ol className="toasts" aria-live="polite" aria-label="Notifications">
        {notifications.map((notification) => (
          <li key={notification.id} className={`toast toast-${notification.type}`}>
            <span>{notification.message}</span>
            <time dateTime={notification.timestamp}>{formatTime(notification.timestamp)}</time>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default Dashboard;
