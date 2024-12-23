const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');

const config = require('./config/config');
const logger = require('./utils/logger');
const { DriverStore } = require('./models/driverStore');
const authRoutes = require('./routes/authRoutes');
const driverRoutes = require('./routes/driverRoutes');
const { setupDriverSocket } = require('./ws/driverSocket');
const { setupDashboardSocket } = require('./ws/dashboardSocket');

function createApp({ store = new DriverStore() } = {}) {
  const app = express();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  app.locals.store = store;
  app.locals.io = io;

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

  app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use((req, res, next) => {
    logger.info(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.nodeEnv,
      version: '1.0.0'
    });
  });

  app.use('/api', authRoutes);
  app.use('/api/driver', driverRoutes);

  app.get('/', (req, res) => {
    res.json({
      message: 'Ride-Sharing Dashboard API',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        auth: {
          login: 'POST /api/login',
          logout: 'POST /api/logout',
          profile: 'GET /api/profile'
        },
        driver: {
          updateLocation: 'POST /api/driver/update',
          getOnlineDrivers: 'GET /api/driver/online',
          getDriverLocation: 'GET /api/driver/:driverId/location',
          getStats: 'GET /api/driver/stats'
        }
      },
      websockets: {
        driverUpdates: '/driver/update',
        dashboard: '/dashboard'
      }
    });
  });

  setupDriverSocket(io, store);
  setupDashboardSocket(io, store);

  // eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
  app.use((error, req, res, next) => {
    logger.error('Unhandled error:', error);
    const status = error.status || error.statusCode || 500;
    res.status(status).json({
      error: error.expose ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    });
  });

  app.use((req, res) => {
    res.status(404).json({
      error: 'Endpoint not found',
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  });

  store.start();

  function close() {
    store.stop();
    return new Promise((resolve) => {
      io.close(() => resolve());
    });
  }

  return { app, server, io, store, close };
}

module.exports = { createApp };
