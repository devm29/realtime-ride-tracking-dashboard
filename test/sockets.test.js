const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, login, nextEvent } = require('./helpers');

describe('driver socket namespace', () => {
  let ctx;
  before(async () => { ctx = await startServer(); });
  after(() => ctx.stop());

  it('refuses a handshake without a token', async () => {
    const socket = ctx.connect('/driver/update');
    const err = await nextEvent(socket, 'connect_error');
    assert.match(err.message, /token required/i);
  });

  it('refuses a handshake with a forged token', async () => {
    const socket = ctx.connect('/driver/update', { auth: { token: 'not.a.jwt' } });
    const err = await nextEvent(socket, 'connect_error');
    assert.match(err.message, /invalid or expired/i);
  });

  it('accepts location updates and confirms them', async () => {
    const token = await login(ctx, 'driver1', 'password1');
    const socket = ctx.connect('/driver/update', { auth: { token } });
    await nextEvent(socket, 'connected');
    socket.emit('location_update', { lat: 40.75, lng: -73.98 });
    const ack = await nextEvent(socket, 'location_updated');
    assert.deepEqual(ack.location, { lat: 40.75, lng: -73.98 });
    assert.equal(ctx.store.isDriverOnline('driver1'), true);
  });

  it('rejects updates that are not numeric coordinates', async () => {
    const token = await login(ctx, 'driver3', 'password3');
    const socket = ctx.connect('/driver/update', { auth: { token } });
    await nextEvent(socket, 'connected');
    socket.emit('location_update', { lat: '40', lng: -73 });
    const err = await nextEvent(socket, 'error');
    assert.match(err.message, /must be numbers/);
  });
});
