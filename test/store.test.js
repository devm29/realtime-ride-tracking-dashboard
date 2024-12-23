const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { DriverStore } = require('../src/models/driverStore');
const { startServer, login, nextEvent } = require('./helpers');

const inFuture = () => new Date(Date.now() + 60000);

describe('DriverStore', () => {
  it('caps the session table by evicting the oldest sessions', () => {
    const store = new DriverStore({ maxActiveTokens: 3 });
    for (const jti of ['a', 'b', 'c', 'd', 'e']) store.storeActiveToken(jti, 'driver1', inFuture());
    assert.equal(store.activeTokens.size, 3);
    assert.equal(store.isTokenActive('a'), null);
    assert.equal(store.isTokenActive('b'), null);
    assert.ok(store.isTokenActive('e'));
  });

  it('sweeps expired sessions and long-stale locations', () => {
    const store = new DriverStore({ retentionMs: 1000 });
    store.storeActiveToken('old', 'driver1', new Date(Date.now() - 1));
    store.storeActiveToken('live', 'driver1', inFuture());
    store.updateDriverLocation('driver1', 40.7, -73.9, { id: 'driver1' });
    store.updateDriverLocation('driver2', 40.8, -73.8, { id: 'driver2' });
    store.driverLocations.get('driver2').timestamp = new Date(Date.now() - 5000);

    store.sweep();

    assert.deepEqual([...store.activeTokens.keys()], ['live']);
    assert.deepEqual([...store.driverLocations.keys()], ['driver1']);
  });

  it('tracks several sockets per driver', () => {
    const store = new DriverStore();
    store.addDriverSocket('driver1', 's1');
    store.addDriverSocket('driver1', 's2');
    assert.equal(store.getStats().connectedSockets, 2);
    assert.equal(store.removeDriverSocket('driver1', 's1'), 1);
    assert.equal(store.removeDriverSocket('driver1', 's2'), 0);
    assert.equal(store.driverSockets.size, 0);
  });

  it('runs its sweep timer without holding the process open', () => {
    const store = new DriverStore();
    store.start();
    assert.equal(store.sweepTimer.hasRef(), false);
    store.stop();
    assert.equal(store.sweepTimer, null);
  });
});

describe('driver with two connections', () => {
  let ctx;
  before(async () => { ctx = await startServer(); });
  after(() => ctx.stop());

  it('stays online until the last connection closes', async () => {
    const token = await login(ctx, 'driver2', 'password2');
    const first = ctx.connect('/driver/update', { auth: { token } });
    const second = ctx.connect('/driver/update', { auth: { token } });
    await Promise.all([nextEvent(first, 'connected'), nextEvent(second, 'connected')]);
    first.emit('location_update', { lat: 40.7, lng: -73.9 });
    await nextEvent(first, 'location_updated');

    first.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(ctx.store.isDriverOnline('driver2'), true);

    second.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(ctx.store.isDriverOnline('driver2'), false);
    assert.equal(ctx.store.getStats().connectedSockets, 0);
  });
});
