const config = require('../config/config');

class DriverStore {
  constructor({
    retentionMs = config.driverDataRetentionMs,
    sweepIntervalMs = 60000,
    maxActiveTokens = config.maxActiveTokens
  } = {}) {
    this.retentionMs = retentionMs;
    this.sweepIntervalMs = sweepIntervalMs;
    this.maxActiveTokens = maxActiveTokens;
    this.activeTokens = new Map();
    this.driverLocations = new Map();
    // driverId -> Set of socket ids; a driver may be connected from more than one tab or device.
    this.driverSockets = new Map();
    this.sweepTimer = null;
  }

  storeActiveToken(token, driverId, expiresAt) {
    // Successful logins are not rate limited, so cap the session table. Maps iterate in
    // insertion order, so the first key is the oldest session.
    while (this.activeTokens.size >= this.maxActiveTokens) {
      this.activeTokens.delete(this.activeTokens.keys().next().value);
    }
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
          location: { lat: locationData.lat, lng: locationData.lng },
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

  addDriverSocket(driverId, socketId) {
    if (!this.driverSockets.has(driverId)) {
      this.driverSockets.set(driverId, new Set());
    }
    this.driverSockets.get(driverId).add(socketId);
  }

  /** Removes one socket and returns how many the driver still has open. */
  removeDriverSocket(driverId, socketId) {
    const sockets = this.driverSockets.get(driverId);
    if (!sockets) return 0;
    sockets.delete(socketId);
    if (sockets.size === 0) {
      this.driverSockets.delete(driverId);
    }
    return sockets.size;
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
      connectedSockets: [...this.driverSockets.values()].reduce((sum, set) => sum + set.size, 0),
      onlineDrivers: this.getOnlineDrivers().length
    };
  }
}

module.exports = { DriverStore };
