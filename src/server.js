const config = require('./config/config');
const logger = require('./utils/logger');
const { createApp } = require('./app');

const { server, close } = createApp();

function shutdown(signal) {
  logger.info(`${signal} received, shutting down...`);
  close().then(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  process.exit(1);
});

server.listen(config.port, () => {
  logger.info(`Ride tracking backend listening on port ${config.port} (${config.nodeEnv})`);
  logger.info('Socket.IO namespaces: /driver/update (drivers), /dashboard (dashboard clients)');
});
