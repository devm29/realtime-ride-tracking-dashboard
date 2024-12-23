// Drives the three demo drivers around New York so the dashboard has something to show.
// Usage: node scripts/simulate-drivers.js   (SIM_SERVER_URL, SIM_INTERVAL_MS optional)
const { io } = require('socket.io-client');
const { generateNearbyLocation } = require('../src/utils/locationGenerator');

const SERVER_URL = process.env.SIM_SERVER_URL || 'http://localhost:3001';
const INTERVAL_MS = Number(process.env.SIM_INTERVAL_MS) || 2000;
const STEP_KM = 0.9;
// Start cars within ~16 km of Lower Manhattan / Brooklyn rather than anywhere in the box,
// so they spend their time in the city instead of pinned against its edges.
const START = { lat: 40.72, lng: -73.96, radiusKm: 16 };

const DEMO_DRIVERS = [
  { username: 'driver1', password: 'password1' },
  { username: 'driver2', password: 'password2' },
  { username: 'driver3', password: 'password3' }
];

async function login({ username, password }) {
  const res = await fetch(`${SERVER_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) throw new Error(`login ${username}: HTTP ${res.status}`);
  return (await res.json()).token;
}

function runDriver(credentials) {
  let position = generateNearbyLocation(START.lat, START.lng, START.radiusKm);
  let socket = null;
  let timer = null;

  async function connect() {
    clearInterval(timer);
    const token = await login(credentials);
    socket = io(`${SERVER_URL}/driver/update`, { auth: { token }, transports: ['websocket'] });

    socket.on('connected', () => {
      console.log(`${credentials.username} streaming from ${position.lat}, ${position.lng}`);
      socket.emit('location_update', position);
      timer = setInterval(() => {
        position = generateNearbyLocation(position.lat, position.lng, STEP_KM);
        socket.emit('location_update', position);
      }, INTERVAL_MS);
    });

    // Tokens last five minutes; when the server ends the session, sign in again.
    socket.on('disconnect', (reason) => {
      clearInterval(timer);
      if (reason === 'io server disconnect') setTimeout(() => connect().catch(retry), 1000);
    });
    socket.on('connect_error', (err) => {
      clearInterval(timer);
      socket.close();
      retry(err);
    });
  }

  function retry(err) {
    console.error(`${credentials.username}: ${err.message}, retrying in 3s`);
    setTimeout(() => connect().catch(retry), 3000);
  }

  connect().catch(retry);
  return () => {
    clearInterval(timer);
    if (socket) socket.close();
  };
}

const stops = DEMO_DRIVERS.map(runDriver);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stops.forEach((stop) => stop());
    process.exit(0);
  });
}
