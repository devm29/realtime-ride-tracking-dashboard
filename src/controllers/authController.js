const { validateDriverCredentials, generateToken } = require('../utils/auth');
const config = require('../config/config');
const logger = require('../utils/logger');

async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: 'Username and password are required'
      });
    }

    const driverProfile = validateDriverCredentials(username, password);
    if (!driverProfile) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    const driverStore = req.app.locals.store;
    const token = generateToken(driverProfile);
    
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5); 
    
    driverStore.storeActiveToken(token, driverProfile.id, expiresAt);

    logger.info(`Driver ${driverProfile.id} logged in`);

    res.json({
      success: true,
      token,
      profile: driverProfile,
      expiresIn: config.jwtExpiry,
      expiresAt: expiresAt.toISOString()
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      error: 'Internal server error during login'
    });
  }
}

async function logout(req, res) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const driverStore = req.app.locals.store;

    if (token) {
      driverStore.removeActiveToken(token);
      
      if (req.user && req.user.driverId) {
        driverStore.removeDriver(req.user.driverId);
      }

      logger.info(`Driver ${req.user?.driverId} logged out`);
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      error: 'Internal server error during logout'
    });
  }
}

async function getProfile(req, res) {
  try {
    const driverId = req.user.driverId;
    const driverStore = req.app.locals.store;
    const locationData = driverStore.getDriverLocation(driverId);
    
    res.json({
      success: true,
      profile: req.user,
      location: locationData ? {
        lat: locationData.lat,
        lng: locationData.lng,
        timestamp: locationData.timestamp
      } : null,
      isOnline: driverStore.isDriverOnline(driverId)
    });

  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      error: 'Internal server error while fetching profile'
    });
  }
}

module.exports = {
  login,
  logout,
  getProfile
}; 