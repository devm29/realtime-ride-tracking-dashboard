const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startServer, login, nextEvent } = require('./helpers');

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

describe('authentication and roles', () => {
  let ctx;
  let driverToken;
  let dispatcherToken;

  before(async () => {
    ctx = await startServer();
    driverToken = await login(ctx, 'driver1', 'password1');
    dispatcherToken = await login(ctx, 'dispatcher', 'dispatch1');
  });
  after(() => ctx.stop());

  const auth = (token) => ({ Authorization: `Bearer ${token}` });

  it('issues dispatcher tokens with the dispatcher role', async () => {
    const res = await ctx.http().get('/api/profile').set(auth(dispatcherToken));
    assert.equal(res.status, 200);
    assert.equal(res.body.profile.role, 'dispatcher');
  });

  it('keeps tracking reads behind a dispatcher token', async () => {
    assert.equal((await ctx.http().get('/api/driver/online')).status, 401);
    assert.equal((await ctx.http().get('/api/driver/stats')).status, 401);
    assert.equal((await ctx.http().get('/api/driver/online').set(auth(driverToken))).status, 403);
    const online = await ctx.http().get('/api/driver/online').set(auth(dispatcherToken));
    assert.equal(online.status, 200);
    assert.ok(Array.isArray(online.body.drivers));
  });

  it('only lets drivers publish locations', async () => {
    const res = await ctx.http().post('/api/driver/update').set(auth(dispatcherToken)).send({ lat: 40.7, lng: -73.9 });
    assert.equal(res.status, 403);
  });

  it('ignores a driver id smuggled into the update body', async () => {
    await ctx.http().post('/api/driver/update').set(auth(driverToken))
      .send({ lat: 40.71, lng: -73.91, driverId: 'driver2' });
    assert.equal(ctx.store.getDriverLocation('driver1').lat, 40.71);
    assert.equal(ctx.store.getDriverLocation('driver2'), null);

    const online = await ctx.http().get('/api/driver/online').set(auth(dispatcherToken));
    const driver1 = online.body.drivers.find((driver) => driver.driverId === 'driver1');
    assert.deepEqual(driver1.location, { lat: 40.71, lng: -73.91 });
  });

  it('lets a driver read only their own location', async () => {
    const own = await ctx.http().get('/api/driver/driver1/location').set(auth(driverToken));
    assert.equal(own.status, 200);
    const other = await ctx.http().get('/api/driver/driver2/location').set(auth(driverToken));
    assert.equal(other.status, 403);
    const asDispatcher = await ctx.http().get('/api/driver/driver1/location').set(auth(dispatcherToken));
    assert.equal(asDispatcher.status, 200);
  });

  it('rejects unsigned and foreign-signed tokens', async () => {
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'dispatcher', role: 'dispatcher', jti: 'x' })}.`;
    const foreign = jwt.sign({ sub: 'dispatcher', role: 'dispatcher' }, 'some-other-secret', { jwtid: 'y' });
    for (const token of [unsigned, foreign]) {
      assert.equal((await ctx.http().get('/api/driver/online').set(auth(token))).status, 401);
    }
  });

  it('refuses a dashboard handshake without a dispatcher token', async () => {
    const anonymous = ctx.connect('/dashboard');
    assert.match((await nextEvent(anonymous, 'connect_error')).message, /token required/i);

    const asDriver = ctx.connect('/dashboard', { auth: { token: driverToken } });
    assert.match((await nextEvent(asDriver, 'connect_error')).message, /not allowed/i);
  });

  it('refuses a driver-namespace handshake with a dispatcher token', async () => {
    const socket = ctx.connect('/driver/update', { auth: { token: dispatcherToken } });
    assert.match((await nextEvent(socket, 'connect_error')).message, /not allowed/i);
  });

  it('streams driver positions to an authenticated dashboard', async () => {
    const dashboard = ctx.connect('/dashboard', { auth: { token: dispatcherToken } });
    await nextEvent(dashboard, 'online_drivers');

    const driver = ctx.connect('/driver/update', { auth: { token: driverToken } });
    await nextEvent(driver, 'connected');
    const update = nextEvent(dashboard, 'driver_location_update');
    driver.emit('location_update', { lat: 40.72, lng: -73.95 });
    const payload = await update;
    assert.equal(payload.driverId, 'driver1');
    assert.deepEqual(payload.location, { lat: 40.72, lng: -73.95 });
  });

  it('follows one driver: snapshot on subscribe, offline notice, unsubscribe', async () => {
    const dashboard = ctx.connect('/dashboard', { auth: { token: dispatcherToken } });
    await nextEvent(dashboard, 'connected');

    dashboard.emit('subscribe', { driverId: 'driver1' });
    const data = await nextEvent(dashboard, 'driver_data');
    assert.equal(data.driverId, 'driver1');
    assert.equal(data.isOnline, true);
    assert.equal(typeof data.location.lat, 'number');

    dashboard.emit('subscribe', { driverId: 'driver2' });
    assert.equal((await nextEvent(dashboard, 'driver_offline')).driverId, 'driver2');

    dashboard.emit('unsubscribe');
    assert.equal((await nextEvent(dashboard, 'unsubscribed')).driverId, 'driver2');

    dashboard.emit('get_driver_info', { driverId: 'driver1' });
    assert.equal((await nextEvent(dashboard, 'driver_info')).driverId, 'driver1');
  });

  it('rejects subscriptions to unknown drivers', async () => {
    const dashboard = ctx.connect('/dashboard', { auth: { token: dispatcherToken } });
    await nextEvent(dashboard, 'connected');
    dashboard.emit('subscribe', { driverId: '__proto__' });
    assert.match((await nextEvent(dashboard, 'error')).message, /unknown driver/i);
  });

  it('revokes the token and closes its live socket on logout', async () => {
    const token = await login(ctx, 'driver3', 'password3');
    const driver = ctx.connect('/driver/update', { auth: { token } });
    await nextEvent(driver, 'connected');

    const closed = nextEvent(driver, 'disconnect');
    const res = await ctx.http().post('/api/logout').set(auth(token));
    assert.equal(res.status, 200);
    assert.equal(await closed, 'io server disconnect');

    assert.equal((await ctx.http().get('/api/profile').set(auth(token))).status, 401);
    const again = ctx.connect('/driver/update', { auth: { token } });
    assert.match((await nextEvent(again, 'connect_error')).message, /invalid or expired/i);
  });
});
