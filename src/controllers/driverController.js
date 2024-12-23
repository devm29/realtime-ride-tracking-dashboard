const { getDriverProfile, ROLES } = require('../utils/auth');
const { recordDriverLocation } = require('../services/locationService');

function updateLocation(req, res) {
  const { lat, lng } = req.body || {};

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({
      error: 'Invalid location data: lat and lng must be numbers'
    });
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({
      error: 'Invalid coordinates: lat must be -90 to 90, lng must be -180 to 180'
    });
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
