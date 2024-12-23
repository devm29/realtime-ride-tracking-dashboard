const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, login } = require('./helpers');

describe('REST API', () => {
  let ctx;
  before(async () => { ctx = await startServer(); });
  after(() => ctx.stop());

  it('reports health', async () => {
    const res = await ctx.http().get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'healthy');
  });

  it('logs a driver in and returns a token and profile', async () => {
    const res = await ctx.http().post('/api/login').send({ username: 'driver1', password: 'password1' });
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.token, 'string');
    assert.equal(res.body.profile.id, 'driver1');
  });

  it('rejects a wrong password and a missing field', async () => {
    const wrong = await ctx.http().post('/api/login').send({ username: 'driver1', password: 'nope' });
    assert.equal(wrong.status, 401);
    const missing = await ctx.http().post('/api/login').send({ username: 'driver1' });
    assert.equal(missing.status, 400);
  });

  it('answers malformed JSON with 400, not 500', async () => {
    const res = await ctx.http().post('/api/login').set('Content-Type', 'application/json').send('{"username":');
    assert.equal(res.status, 400);
  });

  it('stores a driver location sent over REST', async () => {
    const token = await login(ctx, 'driver2', 'password2');
    const res = await ctx.http().post('/api/driver/update')
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: 40.7, lng: -73.9 });
    assert.equal(res.status, 200);
    assert.deepEqual(ctx.store.getDriverLocation('driver2').lat, 40.7);
  });

  it('rejects out-of-range coordinates', async () => {
    const token = await login(ctx, 'driver2', 'password2');
    const res = await ctx.http().post('/api/driver/update')
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: 91, lng: 0 });
    assert.equal(res.status, 400);
  });

  it('returns 404 JSON for unknown routes', async () => {
    const res = await ctx.http().get('/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Endpoint not found');
  });
});
