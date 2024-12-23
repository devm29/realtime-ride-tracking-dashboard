const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { login, logout, getProfile } = require('../controllers/authController');
const { authenticateToken } = require('../utils/auth');

function createAuthRouter(limits) {
  const router = express.Router();

  const loginLimiter = rateLimit({
    ...limits.login,
    skipSuccessfulRequests: true,
    // Per client and account, so one guessed account does not lock out everyone behind the same NAT.
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.username ?? '')}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many failed login attempts, try again later' }
  });

  router.post('/login', loginLimiter, login);
  router.post('/logout', authenticateToken, logout);
  router.get('/profile', authenticateToken, getProfile);

  return router;
}

module.exports = { createAuthRouter };
