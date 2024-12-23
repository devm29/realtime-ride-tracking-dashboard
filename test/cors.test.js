const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, login, nextEvent } = require('./helpers');

const ALLOWED = 'https://dispatch.example.test';
const FOREIGN = 'https://evil.example.test';

describe('CORS origins', () => {
  let ctx;
  before(async () => { ctx = await startServer({ corsOrigins: [ALLOWED] }); });
  after(() => ctx.stop());

  it('answers preflights from configured origins', async () => {
    const res = await ctx.http().options('/api/login')
      .set('Origin', ALLOWED).set('Access-Control-Request-Method', 'POST');
    assert.equal(res.headers['access-control-allow-origin'], ALLOWED);
  });

  it('gives other origins no CORS headers', async () => {
    const res = await ctx.http().options('/api/login')
      .set('Origin', FOREIGN).set('Access-Control-Request-Method', 'POST');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  it('refuses WebSocket upgrades from foreign origins', async () => {
    const token = await login(ctx, 'driver1', 'password1');
    const socket = ctx.connect('/driver/update', { auth: { token }, extraHeaders: { origin: FOREIGN } });
    await nextEvent(socket, 'connect_error');
    assert.equal(socket.connected, false);
  });

  it('accepts WebSocket upgrades from configured origins and from the same host', async () => {
    const token = await login(ctx, 'driver1', 'password1');
    const fromAllowed = ctx.connect('/driver/update', { auth: { token }, extraHeaders: { origin: ALLOWED } });
    await nextEvent(fromAllowed, 'connected');
    const sameHost = ctx.connect('/driver/update', { auth: { token }, extraHeaders: { origin: ctx.url } });
    await nextEvent(sameHost, 'connected');
  });
});
