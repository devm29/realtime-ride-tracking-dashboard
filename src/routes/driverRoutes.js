const express = require('express');
const { updateLocation, getOnlineDrivers, getDriverLocation, getStats } = require('../controllers/driverController');
const { authenticateToken, requireRole, ROLES } = require('../utils/auth');

const router = express.Router();

router.use(authenticateToken);

router.post('/update', requireRole(ROLES.DRIVER), updateLocation);
router.get('/online', requireRole(ROLES.DISPATCHER), getOnlineDrivers);
router.get('/stats', requireRole(ROLES.DISPATCHER), getStats);
// Drivers may read their own position; the controller enforces that.
router.get('/:driverId/location', requireRole(ROLES.DRIVER, ROLES.DISPATCHER), getDriverLocation);

module.exports = router;
