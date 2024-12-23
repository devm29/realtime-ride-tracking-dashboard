const { getDriverProfile, ROLES } = require('../utils/auth');
const { recordDriverLocation } = require('../services/locationService');
const { parseLocation } = require('../utils/validation');

function updateLocation(req, res) {
  const { lat, lng, error } = parseLocation(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  // The driver id always comes from the token, never from the request body.
  const driverId = req.user.driverId;
  if (!getDriverProfile(driverId)) {
    return res.status(404).json({
      error: 'Driver profile not found'
    });
  }

  const { store, io } = req.app.locals;
  recordDriverLocation({ store, io }, driverId, lat, lng);

  res.json({
    success: true,
    message: 'Location updated successfully',
    location: { lat, lng },
    timestamp: new Date().toISOString()
  });
}

function getOnlineDrivers(req, res) {
  const onlineDrivers = req.app.locals.store.getOnlineDrivers();

  res.json({
    success: true,
    drivers: onlineDrivers,
    count: onlineDrivers.length,
    timestamp: new Date().toISOString()
  });
}

function getDriverLocation(req, res) {
  const { driverId } = req.params;

  if (req.user.role === ROLES.DRIVER && req.user.driverId !== driverId) {
    return res.status(403).json({
      error: 'Drivers can only read their own location'
    });
  }

  const store = req.app.locals.store;
  const locationData = store.getDriverLocation(driverId);

  if (!locationData) {
    return res.status(404).json({
      error: 'Driver location not found',
      driverId
    });
  }

  res.json({
    success: true,
    driverId,
    profile: locationData.profile,
    location: {
      lat: locationData.lat,
      lng: locationData.lng,
      timestamp: locationData.timestamp
    },
    isOnline: store.isDriverOnline(driverId),
    timestamp: new Date().toISOString()
  });
}

function getStats(req, res) {
  res.json({
    success: true,
    stats: req.app.locals.store.getStats(),
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  updateLocation,
  getOnlineDrivers,
  getDriverLocation,
  getStats
};
