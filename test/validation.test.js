const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { parseLocation } = require('../src/utils/validation');
const { createWindowLimiter } = require('../src/utils/windowLimiter');
const { startServer, login, nextEvent } = require('./helpers');

describe('parseLocation', () => {
  it('accepts the coordinate boundaries', () => {
    assert.deepEqual(parseLocation({ lat: 90, lng: -180 }), { lat: 90, lng: -180 });
    assert.deepEqual(parseLocation({ lat: -90, lng: 180 }), { lat: -90, lng: 180 });
  });

  it('rejects out-of-range, non-numeric and non-finite values', () => {
    for (const payload of [
      { lat: 90.0001, lng: 0 }, { lat: 0, lng: -180.5 },
      { lat: '40.7', lng: -73.9 }, { lat: NaN, lng: 0 }, { lat: 0, lng: Infinity }, { lat: null, lng: 0 }
    ]) {
      assert.ok(parseLocation(payload).error, JSON.stringify(payload));
    }
  });

  it('rejects payloads that are not plain objects', () => {
    for (const payload of [null, undefined, 42, 'lat', [40.7, -73.9]]) {
      assert.match(parseLocation(payload).error, /expected an object/);
    }
  });
});

describe('createWindowLimiter', () => {
  it('allows max hits per window and resets afterwards', () => {
    let clock = 0;
    const allow = createWindowLimiter({ max: 2, windowMs: 1000 }, () => clock);
    assert.deepEqual([allow(), allow(), allow()], [true, true, false]);
    clock = 1000;
    assert.equal(allow(), true);
  });
});

describe('request limits', () => {
  let ctx;
  const limits = {
    login: { max: 2, windowMs: 60000 },
    locationUpdates: { max: 3, windowMs: 60000 }
  };

  before(async () => { ctx = await startServer({ limits }); });
  after(() => ctx.stop());

  it('rejects JSON bodies over 10 kB', async () => {
    const res = await ctx.http().post('/api/login').send({ username: 'x'.repeat(12 * 1024), password: 'p' });
    assert.equal(res.status, 413);
  });

  it('throttles repeated failed logins per client and account', async () => {
    const attempt = (password) => ctx.http().post('/api/login').send({ username: 'dispatcher', password });
    assert.equal((await attempt('wrong')).status, 401);
    assert.equal((await attempt('wrong')).status, 401);
    const blocked = await attempt('dispatch1');
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.error, /too many failed login/i);

    const otherAccount = await ctx.http().post('/api/login').send({ username: 'driver1', password: 'password1' });
    assert.equal(otherAccount.status, 200);
  });

  it('throttles REST location updates per driver', async () => {
    const token = await login(ctx, 'driver2', 'password2');
    const send = () => ctx.http().post('/api/driver/update')
      .set('Authorization', `Bearer ${token}`).send({ lat: 40.7, lng: -73.9 });
    for (let i = 0; i < 3; i += 1) assert.equal((await send()).status, 200);
    assert.equal((await send()).status, 429);
  });

  it('throttles socket location updates per connection', async () => {
    const token = await login(ctx, 'driver3', 'password3');
    const socket = ctx.connect('/driver/update', { auth: { token } });
    await nextEvent(socket, 'connected');
    for (let i = 0; i < 3; i += 1) {
      socket.emit('location_update', { lat: 40.7, lng: -73.9 });
      await nextEvent(socket, 'location_updated');
    }
    socket.emit('location_update', { lat: 40.7, lng: -73.9 });
    assert.match((await nextEvent(socket, 'error')).message, /too many/i);
  });

  it('drops socket messages over the 10 kB buffer limit', async () => {
    const token = await login(ctx, 'driver1', 'password1');
    const socket = ctx.connect('/driver/update', { auth: { token } });
    await nextEvent(socket, 'connected');
    socket.emit('location_update', { lat: 40.7, lng: -73.9, padding: 'x'.repeat(20 * 1024) });
    assert.equal(await nextEvent(socket, 'disconnect'), 'transport close');
  });

  it('rejects a socket payload that is not an object', async () => {
    const token = await login(ctx, 'driver1', 'password1');
    const socket = ctx.connect('/driver/update', { auth: { token } });
    await nextEvent(socket, 'connected');
    socket.emit('location_update', 'here');
    assert.match((await nextEvent(socket, 'error')).message, /expected an object/);
  });
});

describe('locationGenerator', () => {
  const { generateRandomNYCLocation, generateNearbyLocation, isWithinNYCBounds } = require('../src/utils/locationGenerator');

  it('keeps simulated positions inside the NYC box', () => {
    let position = generateRandomNYCLocation();
    for (let i = 0; i < 200; i += 1) {
      assert.ok(isWithinNYCBounds(position.lat, position.lng), JSON.stringify(position));
      position = generateNearbyLocation(position.lat, position.lng, 5);
    }
  });
});
