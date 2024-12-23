const { socketAuth, getDriverProfile, ROLES } = require('../utils/auth');
const { recordDriverLocation } = require('../services/locationService');
const { parseLocation } = require('../utils/validation');
const { createWindowLimiter } = require('../utils/windowLimiter');
const logger = require('../utils/logger');

/**
 * Namespace /driver/update — drivers stream their own position.
 * The handshake must carry a live driver token; the driver id always comes from that token.
 */
function setupDriverSocket(io, driverStore, limits) {
  const driverNamespace = io.of('/driver/update');
  driverNamespace.use(socketAuth(driverStore, ROLES.DRIVER));

  driverNamespace.on('connection', (socket) => {
    const { driverId, name: driverName, jti } = socket.user;

    socket.join(`session:${jti}`);
    const allowUpdate = createWindowLimiter(limits.locationUpdates);
    driverStore.setDriverSocket(driverId, socket.id);
    logger.info(`Driver ${driverId} connected via WebSocket`);

    socket.on('location_update', (data) => {
      // The handshake was checked once; re-check so a logged-out or expired session stops here.
      if (!driverStore.isTokenActive(jti) || socket.user.exp * 1000 < Date.now()) {
        socket.emit('error', { message: 'Session expired, please sign in again' });
        socket.disconnect(true);
        return;
      }

      if (!allowUpdate()) {
        socket.emit('error', { message: 'Too many location updates, slow down' });
        return;
      }

      const { lat, lng, error } = parseLocation(data);
      if (error) {
        socket.emit('error', { message: error });
        return;
      }

      if (!getDriverProfile(driverId)) {
        socket.emit('error', { message: 'Driver profile not found' });
        return;
      }

      recordDriverLocation({ store: driverStore, io }, driverId, lat, lng);

      socket.emit('location_updated', {
        success: true,
        location: { lat, lng },
        timestamp: new Date().toISOString()
      });
    });

    socket.on('start_sharing', () => {
      socket.emit('sharing_started', {
        message: 'Location sharing started',
        driverId,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('stop_sharing', () => {
      socket.emit('sharing_stopped', {
        message: 'Location sharing stopped',
        driverId,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    socket.on('disconnect', (reason) => {
      logger.info(`Driver ${driverId} disconnected: ${reason}`);
      driverStore.removeDriver(driverId);

      const dashboardNamespace = io.of('/dashboard');
      dashboardNamespace.emit('driver_disconnected', {
        driverId,
        profile: { id: driverId, name: driverName },
        timestamp: new Date().toISOString(),
        reason
      });

      const onlineDrivers = driverStore.getOnlineDrivers();
      dashboardNamespace.emit('online_drivers', {
        drivers: onlineDrivers,
        count: onlineDrivers.length,
        timestamp: new Date().toISOString()
      });
    });

    socket.emit('connected', {
      message: 'Successfully connected to driver location service',
      driverId,
      name: driverName,
      timestamp: new Date().toISOString()
    });
  });

  return driverNamespace;
}

module.exports = { setupDriverSocket };
