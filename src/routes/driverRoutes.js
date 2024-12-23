const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { updateLocation, getOnlineDrivers, getDriverLocation, getStats } = require('../controllers/driverController');
const { authenticateToken, requireRole, ROLES } = require('../utils/auth');

function createDriverRouter(limits) {
  const router = express.Router();

  const updateLimiter = rateLimit({
    ...limits.locationUpdates,
    keyGenerator: (req) => req.user.sub,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many location updates, slow down' }
  });

  router.use(authenticateToken);

  router.post('/update', requireRole(ROLES.DRIVER), updateLimiter, updateLocation);
  router.get('/online', requireRole(ROLES.DISPATCHER), getOnlineDrivers);
  router.get('/stats', requireRole(ROLES.DISPATCHER), getStats);
  // Drivers may read their own position; the controller enforces that.
  router.get('/:driverId/location', requireRole(ROLES.DRIVER, ROLES.DISPATCHER), getDriverLocation);

  return router;
}

module.exports = { createDriverRouter };
