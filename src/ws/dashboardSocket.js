const logger = require('../utils/logger');
const config = require('../config/config');
const { socketAuth, getDriverProfile, ROLES } = require('../utils/auth');

/**
 * Namespace /dashboard — dispatchers watch online drivers and follow one at a time.
 * Driver positions are personal data, so the handshake needs a live dispatcher token.
 */
function setupDashboardSocket(io, driverStore) {
  const dashboardNamespace = io.of('/dashboard');
  dashboardNamespace.use(socketAuth(driverStore, ROLES.DISPATCHER));

  function snapshot(driverId) {
    const locationData = driverStore.getDriverLocation(driverId);
    if (!locationData) return null;
    return {
      driverId,
      profile: locationData.profile,
      location: {
        lat: locationData.lat,
        lng: locationData.lng,
        timestamp: locationData.timestamp
      },
      isOnline: driverStore.isDriverOnline(driverId)
    };
  }

  function onlineDriversPayload() {
    const drivers = driverStore.getOnlineDrivers();
    return { drivers, count: drivers.length, timestamp: new Date().toISOString() };
  }

  dashboardNamespace.on('connection', (socket) => {
    logger.info(`Dashboard client connected: ${socket.id}`);
    socket.join(`session:${socket.user.jti}`);

    let currentDriverId = null;
    let updateInterval = null;
    let offlineNotificationInterval = null;

    function stopFollowing() {
      clearInterval(updateInterval);
      clearInterval(offlineNotificationInterval);
      updateInterval = null;
      offlineNotificationInterval = null;
    }

    function knownDriverId(data, emptyMessage) {
      const { driverId } = data || {};
      if (!driverId) {
        socket.emit('error', { message: emptyMessage });
        return null;
      }
      if (!getDriverProfile(driverId)) {
        socket.emit('error', { message: `Unknown driver ${driverId}` });
        return null;
      }
      return driverId;
    }

    socket.on('subscribe', (data) => {
      const driverId = knownDriverId(data, 'Driver ID is required for subscription');
      if (!driverId) return;

      stopFollowing();
      currentDriverId = driverId;
      logger.info(`Dashboard client ${socket.id} subscribed to driver ${driverId}`);

      const sendIfOnline = () => {
        const current = snapshot(driverId);
        if (current && current.isOnline) {
          socket.emit('driver_data', { ...current, lastUpdate: new Date().toISOString() });
          return true;
        }
        return false;
      };

      if (!sendIfOnline()) {
        socket.emit('driver_offline', {
          driverId,
          message: 'Driver is currently offline or no location data available',
          timestamp: new Date().toISOString()
        });
      }

      updateInterval = setInterval(sendIfOnline, config.dashboardUpdateInterval);

      offlineNotificationInterval = setInterval(() => {
        const current = snapshot(driverId);
        if (!current || !current.isOnline) {
          socket.emit('OFFLINE_DRIVER', {
            driverId,
            message: 'Driver is currently offline - no recent location data',
            lastSeen: current ? current.location.timestamp : null,
            timestamp: new Date().toISOString()
          });
        }
      }, config.offlineDriverNotificationInterval);

      socket.emit('subscribed', {
        driverId,
        message: `Successfully subscribed to driver ${driverId}`,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('unsubscribe', () => {
      if (!currentDriverId) return;
      logger.info(`Dashboard client ${socket.id} unsubscribed from driver ${currentDriverId}`);
      stopFollowing();
      socket.emit('unsubscribed', {
        driverId: currentDriverId,
        message: `Unsubscribed from driver ${currentDriverId}`,
        timestamp: new Date().toISOString()
      });
      currentDriverId = null;
    });

    socket.on('get_online_drivers', () => {
      socket.emit('online_drivers', onlineDriversPayload());
    });

    socket.on('get_driver_info', (data) => {
      const driverId = knownDriverId(data, 'Driver ID is required');
      if (!driverId) return;

      const current = snapshot(driverId);
      if (current) {
        socket.emit('driver_info', { ...current, timestamp: new Date().toISOString() });
      } else {
        socket.emit('driver_not_found', {
          driverId,
          message: 'Driver not found or no location data available',
          timestamp: new Date().toISOString()
        });
      }
    });

    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    socket.on('disconnect', (reason) => {
      logger.info(`Dashboard client ${socket.id} disconnected: ${reason}`);
      stopFollowing();
    });

    socket.emit('connected', {
      message: 'Successfully connected to dashboard service',
      clientId: socket.id,
      timestamp: new Date().toISOString(),
      features: {
        realTimeUpdates: true,
        driverSubscription: true,
        offlineNotifications: true,
        updateInterval: config.dashboardUpdateInterval,
        offlineCheckInterval: config.offlineDriverNotificationInterval
      }
    });

    // Listeners are registered before the client connects, so no delay is needed.
    socket.emit('online_drivers', onlineDriversPayload());
  });

  return dashboardNamespace;
}

module.exports = { setupDashboardSocket };
