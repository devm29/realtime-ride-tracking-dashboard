const { validateCredentials, generateToken, ROLES } = require('../utils/auth');
const config = require('../config/config');
const logger = require('../utils/logger');

function login(req, res) {
  const { username, password } = req.body || {};

  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({
      error: 'Username and password are required'
    });
  }

  const profile = validateCredentials(username, password);
  if (!profile) {
    return res.status(401).json({
      error: 'Invalid credentials'
    });
  }

  const { token, jti, expiresAt } = generateToken(profile);
  req.app.locals.store.storeActiveToken(jti, profile.id, expiresAt);

  logger.info(`${profile.role} ${profile.id} logged in`);

  res.json({
    success: true,
    token,
    profile,
    expiresIn: config.jwtExpiry,
    expiresAt: expiresAt.toISOString()
  });
}

function logout(req, res) {
  const { store, io } = req.app.locals;
  store.removeActiveToken(req.user.jti);

  if (req.user.role === ROLES.DRIVER) {
    store.removeDriver(req.user.driverId);
    // Close any live socket opened with this session so it cannot keep publishing.
    io.of('/driver/update').in(`session:${req.user.jti}`).disconnectSockets(true);
  } else {
    io.of('/dashboard').in(`session:${req.user.jti}`).disconnectSockets(true);
  }

  logger.info(`${req.user.role} ${req.user.sub} logged out`);

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
}

function getProfile(req, res) {
  const store = req.app.locals.store;
  const { sub, role, name } = req.user;

  if (role !== ROLES.DRIVER) {
    return res.json({ success: true, profile: { id: sub, role, name } });
  }

  const locationData = store.getDriverLocation(sub);
  res.json({
    success: true,
    profile: { ...locationData?.profile, id: sub, role, name },
    location: locationData ? {
      lat: locationData.lat,
      lng: locationData.lng,
      timestamp: locationData.timestamp
    } : null,
    isOnline: store.isDriverOnline(sub)
  });
}

module.exports = {
  login,
  logout,
  getProfile
};
