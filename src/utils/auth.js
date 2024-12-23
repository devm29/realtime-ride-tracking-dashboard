const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const logger = require('./logger');

// Demo accounts only. Drivers publish their own position; the dispatcher watches all of them.
const DRIVERS = {
  driver1: {
    username: 'driver1',
    password: 'password1',
    profile: {
      id: 'driver1',
      name: 'John Smith',
      vehicle: 'Toyota Camry 2020',
      license: 'ABC123',
      rating: 4.8
    }
  },
  driver2: {
    username: 'driver2',
    password: 'password2',
    profile: {
      id: 'driver2',
      name: 'Sarah Johnson',
      vehicle: 'Honda Civic 2021',
      license: 'XYZ789',
      rating: 4.9
    }
  },
  driver3: {
    username: 'driver3',
    password: 'password3',
    profile: {
      id: 'driver3',
      name: 'Mike Davis',
      vehicle: 'Ford Focus 2019',
      license: 'DEF456',
      rating: 4.7
    }
  }
};

const DISPATCHERS = {
  dispatcher: {
    username: 'dispatcher',
    password: 'dispatch1',
    profile: { id: 'dispatcher', name: 'Dispatch Desk' }
  }
};

const ROLES = { DRIVER: 'driver', DISPATCHER: 'dispatcher' };

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function validateCredentials(username, password) {
  if (Object.hasOwn(DRIVERS, username) && safeEqual(DRIVERS[username].password, password)) {
    return { ...DRIVERS[username].profile, role: ROLES.DRIVER };
  }
  if (Object.hasOwn(DISPATCHERS, username) && safeEqual(DISPATCHERS[username].password, password)) {
    return { ...DISPATCHERS[username].profile, role: ROLES.DISPATCHER };
  }
  return null;
}

function getDriverProfile(driverId) {
  return Object.hasOwn(DRIVERS, driverId) ? DRIVERS[driverId].profile : null;
}

/** Signs a token and returns it with the id and expiry the store needs for revocation. */
function generateToken(profile) {
  const jti = crypto.randomUUID();
  const claims = { sub: profile.id, role: profile.role, name: profile.name };
  if (profile.role === ROLES.DRIVER) {
    claims.driverId = profile.id;
    claims.vehicle = profile.vehicle;
  }
  const token = jwt.sign(claims, config.jwtSecret, {
    expiresIn: config.jwtExpiry,
    jwtid: jti,
    algorithm: 'HS256'
  });
  const { exp } = jwt.decode(token);
  return { token, jti, expiresAt: new Date(exp * 1000) };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch (error) {
    logger.warn('Token verification failed:', error.message);
    return null;
  }
}

/** A token counts only if it verifies and has not been revoked by logout. */
function resolveToken(token, store) {
  const decoded = token ? verifyToken(token) : null;
  if (!decoded || !decoded.jti || !store.isTokenActive(decoded.jti)) return null;
  return decoded;
}

function bearerToken(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

function authenticateToken(req, res, next) {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const decoded = resolveToken(token, req.app.locals.store);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.token = token;
  req.user = decoded;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not allowed for this role' });
    }
    next();
  };
}

/** Socket.IO namespace middleware: verifies the handshake token and the caller's role. */
function socketAuth(store, ...roles) {
  return (socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const decoded = resolveToken(token, store);
    if (!decoded) {
      return next(new Error('Invalid or expired token'));
    }
    if (!roles.includes(decoded.role)) {
      return next(new Error('Not allowed for this role'));
    }

    socket.user = decoded;
    next();
  };
}

module.exports = {
  DRIVERS,
  ROLES,
  validateCredentials,
  getDriverProfile,
  generateToken,
  verifyToken,
  resolveToken,
  authenticateToken,
  requireRole,
  socketAuth
};
