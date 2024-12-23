const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer } = require('./helpers');

describe('serving the built frontend', () => {
  let ctx;
  let dir;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ride-ui-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Ride Tracker</title><div id="root"></div>');
    ctx = await startServer({ staticDir: dir });
  });
  after(async () => {
    await ctx.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves index.html at / with a same-origin content security policy', async () => {
    const res = await ctx.http().get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /Ride Tracker/);
    assert.match(res.headers['content-security-policy'], /default-src 'self'/);
    assert.match(res.headers['content-security-policy'], /script-src 'self'/);
    assert.doesNotMatch(res.headers['content-security-policy'], /upgrade-insecure-requests/);
  });

  it('keeps the API index at /api', async () => {
    const res = await ctx.http().get('/api');
    assert.equal(res.status, 200);
    assert.equal(res.body.endpoints.auth.login, 'POST /api/login');
  });
});

describe('without a built frontend', () => {
  it('answers / with a JSON 404', async () => {
    const ctx = await startServer({ staticDir: path.join(os.tmpdir(), 'does-not-exist') });
    try {
      const res = await ctx.http().get('/');
      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'Endpoint not found');
    } finally {
      await ctx.stop();
    }
  });
});
