process.env.NODE_ENV = 'test';

const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const { createApp } = require('../src/app');

async function startServer(options) {
  const ctx = createApp(options);
  await new Promise((resolve) => ctx.server.listen(0, '127.0.0.1', resolve));
  ctx.url = `http://127.0.0.1:${ctx.server.address().port}`;
  ctx.http = () => request(ctx.url);
  ctx.clients = [];

  ctx.connect = (namespace, opts = {}) => {
    const socket = ioClient(ctx.url + namespace, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      ...opts
    });
    ctx.clients.push(socket);
    return socket;
  };

  ctx.stop = async () => {
    ctx.clients.forEach((socket) => socket.disconnect());
    await ctx.close();
  };

  return ctx;
}

async function login(ctx, username, password) {
  const res = await ctx.http().post('/api/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${res.status}`);
  return res.body.token;
}

function nextEvent(socket, event, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

module.exports = { startServer, login, nextEvent };
