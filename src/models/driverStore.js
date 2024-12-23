const config = require('../config/config');
const logger = require('../utils/logger');

class DriverStore {
  constructor({ retentionMs = config.driverDataRetentionMs, sweepIntervalMs = 60000 } = {}) {
    this.retentionMs = retentionMs;
    this.sweepIntervalMs = sweepIntervalMs;
    this.activeTokens = new Map();
    this.driverLocations = new Map();
    this.driverSockets = new Map();
    this.sweepTimer = null;
  }

  storeActiveToken(token, driverId, expiresAt) {
    this.activeTokens.set(token, { driverId, expiresAt });
  }

  isTokenActive(token) {
    const tokenData = this.activeTokens.get(token);
    if (!tokenData) return null;

    if (new Date() > tokenData.expiresAt) {
      this.activeTokens.delete(token);
      return null;
    }

    return tokenData;
  }

  removeActiveToken(token) {
    this.activeTokens.delete(token);
  }

  updateDriverLocation(driverId, lat, lng, profile = null) {
    this.driverLocations.set(driverId, {
      lat,
      lng,
      timestamp: new Date(),
      profile: profile || this.getDriverProfile(driverId)
    });
  }

  getDriverLocation(driverId) {
    return this.driverLocations.get(driverId) || null;
  }

  getDriverProfile(driverId) {
    const locationData = this.driverLocations.get(driverId);
    return locationData ? locationData.profile : null;
  }

  getOnlineDrivers() {
    const now = new Date();
    const onlineDrivers = [];

    for (const [driverId, locationData] of this.driverLocations.entries()) {
      if (now - locationData.timestamp <= this.retentionMs) {
        onlineDrivers.push({
          driverId,
          profile: locationData.profile,
          lastSeen: locationData.timestamp,
          isOnline: true
        });
      }
    }

    return onlineDrivers;
  }

  isDriverOnline(driverId) {
    const locationData = this.driverLocations.get(driverId);
    if (!locationData) return false;
    return new Date() - locationData.timestamp <= this.retentionMs;
  }

  setDriverSocket(driverId, socketId) {
    this.driverSockets.set(driverId, socketId);
  }

  removeDriverSocket(driverId) {
    this.driverSockets.delete(driverId);
  }

  getDriverSocket(driverId) {
    return this.driverSockets.get(driverId) || null;
  }

  removeDriver(driverId) {
    this.driverLocations.delete(driverId);
    this.driverSockets.delete(driverId);
  }

  sweep() {
    const now = new Date();

    for (const [token, tokenData] of this.activeTokens.entries()) {
      if (now > tokenData.expiresAt) {
        this.activeTokens.delete(token);
      }
    }

    // Stale locations are kept for a second retention window so "last seen" stays answerable.
    for (const [driverId, locationData] of this.driverLocations.entries()) {
      if (now - locationData.timestamp > this.retentionMs * 2) {
        this.driverLocations.delete(driverId);
        this.driverSockets.delete(driverId);
      }
    }
  }

  start() {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweep(), this.sweepIntervalMs);
    this.sweepTimer.unref();
  }

  stop() {
    clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  getStats() {
    return {
      activeTokens: this.activeTokens.size,
      driverLocations: this.driverLocations.size,
      connectedSockets: this.driverSockets.size,
      onlineDrivers: this.getOnlineDrivers().length
    };
  }
}

module.exports = { DriverStore };
