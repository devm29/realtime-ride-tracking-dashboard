/**
 * Origin checks shared by Express and Socket.IO.
 * Requests without an Origin header (curl, native clients, same-origin GETs) are allowed;
 * browser requests must come from the page's own host or a configured origin.
 */
function createOriginPolicy(allowedOrigins) {
  const allowed = new Set(allowedOrigins);

  function isAllowed(origin, host) {
    if (!origin) return true;
    if (allowed.has(origin)) return true;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  return {
    isAllowed,
    corsOptions: {
      origin: (origin, callback) => callback(null, !origin || allowed.has(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    },
    // Socket.IO's cors option only covers polling; the WebSocket upgrade is checked here.
    allowRequest: (req, callback) => {
      const ok = isAllowed(req.headers.origin, req.headers.host);
      callback(ok ? null : 'Origin not allowed', ok);
    }
  };
}

module.exports = { createOriginPolicy };
