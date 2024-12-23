const { getDriverProfile } = require('../utils/auth');

/**
 * Stores a driver's position and fans it out to dashboard clients.
 * REST and WebSocket updates both go through here so they behave the same.
 */
function recordDriverLocation({ store, io }, driverId, lat, lng) {
  const profile = getDriverProfile(driverId);
  const wasOnline = store.isDriverOnline(driverId);
  store.updateDriverLocation(driverId, lat, lng, profile);

  const timestamp = new Date().toISOString();
  const dashboard = io.of('/dashboard');
  dashboard.emit('driver_location_update', { driverId, profile, location: { lat, lng }, timestamp });

  if (!wasOnline) {
    const drivers = store.getOnlineDrivers();
    dashboard.emit('online_drivers', { drivers, count: drivers.length, timestamp });
    dashboard.emit('driver_connected', { driverId, profile, location: { lat, lng }, timestamp });
  }
}

module.exports = { recordDriverLocation };
