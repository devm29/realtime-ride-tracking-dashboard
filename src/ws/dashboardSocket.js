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

  dashboardNamespace.on('connection', (socket) => {
    logger.info(`Dashboard client connected: ${socket.id}`);
    socket.join(`session:${socket.user.jti}`);

    let currentDriverId = null;
    let updateInterval = null;
    let offlineNotificationInterval = null;

    // Handle driver subscription
    socket.on('subscribe', (data) => {
      try {
        const { driverId } = data || {};

        if (!driverId) {
          socket.emit('error', { message: 'Driver ID is required for subscription' });
          return;
        }
        if (!getDriverProfile(driverId)) {
          socket.emit('error', { message: `Unknown driver ${driverId}` });
          return;
        }

        // Unsubscribe from previous driver if any
        if (currentDriverId) {
          clearInterval(updateInterval);
          clearInterval(offlineNotificationInterval);
        }

        currentDriverId = driverId;

        logger.info(`Dashboard client ${socket.id} subscribed to driver ${driverId}`);

        // Send immediate driver data
        const locationData = driverStore.getDriverLocation(driverId);
        const isOnline = driverStore.isDriverOnline(driverId);

        if (locationData && isOnline) {
          socket.emit('driver_data', {
            driverId,
            profile: locationData.profile,
            location: {
              lat: locationData.lat,
              lng: locationData.lng,
              timestamp: locationData.timestamp
            },
            isOnline: true,
            lastUpdate: new Date().toISOString()
          });
        } else {
          socket.emit('driver_offline', {
            driverId,
            message: 'Driver is currently offline or no location data available',
            timestamp: new Date().toISOString()
          });
        }

        // Set up periodic updates every 5 seconds for online drivers
        updateInterval = setInterval(() => {
          const currentLocationData = driverStore.getDriverLocation(driverId);
          const currentIsOnline = driverStore.isDriverOnline(driverId);

          if (currentLocationData && currentIsOnline) {
            // Driver is online, send location data
            socket.emit('driver_data', {
              driverId,
              profile: currentLocationData.profile,
              location: {
                lat: currentLocationData.lat,
                lng: currentLocationData.lng,
                timestamp: currentLocationData.timestamp
              },
              isOnline: true,
              lastUpdate: new Date().toISOString()
            });
          }
        }, config.dashboardUpdateInterval);

        // Set up offline notifications every 60 seconds for offline drivers
        offlineNotificationInterval = setInterval(() => {
          const currentLocationData = driverStore.getDriverLocation(driverId);
          const currentIsOnline = driverStore.isDriverOnline(driverId);

          if (!currentLocationData || !currentIsOnline) {
            // Driver is offline, send offline notification
            socket.emit('OFFLINE_DRIVER', {
              driverId,
              message: 'Driver is currently offline - no recent location data',
              lastSeen: currentLocationData ? currentLocationData.timestamp : null,
              timestamp: new Date().toISOString()
            });
          }
        }, config.offlineDriverNotificationInterval);

        // Confirm subscription
        socket.emit('subscribed', {
          driverId,
          message: `Successfully subscribed to driver ${driverId}`,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Subscription error:', error);
        socket.emit('error', { message: 'Failed to subscribe to driver' });
      }
    });

    // Handle unsubscribe request
    socket.on('unsubscribe', () => {
      if (currentDriverId) {
        logger.info(`Dashboard client ${socket.id} unsubscribed from driver ${currentDriverId}`);
        
        clearInterval(updateInterval);
        clearInterval(offlineNotificationInterval);
        
        socket.emit('unsubscribed', {
          driverId: currentDriverId,
          message: `Unsubscribed from driver ${currentDriverId}`,
          timestamp: new Date().toISOString()
        });
        
        currentDriverId = null;
        updateInterval = null;
        offlineNotificationInterval = null;
      }
    });

    // Handle request for online drivers list
    socket.on('get_online_drivers', () => {
      try {
        const onlineDrivers = driverStore.getOnlineDrivers();
        
        socket.emit('online_drivers', {
          drivers: onlineDrivers,
          count: onlineDrivers.length,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Get online drivers error:', error);
        socket.emit('error', { message: 'Failed to fetch online drivers' });
      }
    });

    // Handle request for specific driver info
    socket.on('get_driver_info', (data) => {
      try {
        const { driverId } = data || {};

        if (!driverId) {
          socket.emit('error', { message: 'Driver ID is required' });
          return;
        }

        const locationData = driverStore.getDriverLocation(driverId);
        const isOnline = driverStore.isDriverOnline(driverId);

        if (locationData) {
          socket.emit('driver_info', {
            driverId,
            profile: locationData.profile,
            location: {
              lat: locationData.lat,
              lng: locationData.lng,
              timestamp: locationData.timestamp
            },
            isOnline,
            timestamp: new Date().toISOString()
          });
        } else {
          socket.emit('driver_not_found', {
            driverId,
            message: 'Driver not found or no location data available',
            timestamp: new Date().toISOString()
          });
        }

      } catch (error) {
        logger.error('Get driver info error:', error);
        socket.emit('error', { message: 'Failed to fetch driver info' });
      }
    });

    // Handle ping for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // Handle client disconnect
    socket.on('disconnect', (reason) => {
      logger.info(`Dashboard client ${socket.id} disconnected: ${reason}`);
      
      // Clean up intervals
      if (updateInterval) clearInterval(updateInterval);
      if (offlineNotificationInterval) clearInterval(offlineNotificationInterval);
      
    });

    // Send welcome message
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
    const onlineDrivers = driverStore.getOnlineDrivers();
    socket.emit('online_drivers', {
      drivers: onlineDrivers,
      count: onlineDrivers.length,
      timestamp: new Date().toISOString()
    });
  });

  return dashboardNamespace;
}

module.exports = { setupDashboardSocket }; 