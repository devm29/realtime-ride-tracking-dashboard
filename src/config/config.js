const crypto = require('crypto');

require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';

function intFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function resolveJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (nodeEnv === 'production') {
    throw new Error('JWT_SECRET must be set when NODE_ENV=production');
  }
  // Dev/test only: a fresh random secret per process, so tokens die with the server.
  return crypto.randomBytes(32).toString('hex');
}

const config = {
  port: process.env.PORT || 3001,
  nodeEnv,
  jwtSecret: resolveJwtSecret(),
  jwtExpiry: '5m',
  dashboardUpdateInterval: 5000,
  offlineDriverNotificationInterval: 60000,
  driverDataRetentionMs: 10 * 60 * 1000,
  rateLimits: {
    // Failed logins per IP per window (successful ones are not counted).
    login: { max: intFromEnv('LOGIN_RATE_LIMIT', 10), windowMs: 15 * 60 * 1000 },
    // Location updates per window: per driver over REST, per connection over WebSocket.
    locationUpdates: { max: intFromEnv('LOCATION_RATE_LIMIT', 60), windowMs: 60 * 1000 }
  },
  nycBounds: {
    north: 40.9176,
    south: 40.4774,
    east: -73.7004,
    west: -74.2591
  }
};

module.exports = config; 