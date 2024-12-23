/**
 * Fixed-window counter for a single socket: allows `max` hits per `windowMs`.
 * State lives on the closure, so it disappears with the socket.
 */
function createWindowLimiter({ max, windowMs }, now = Date.now) {
  let windowStart = now();
  let hits = 0;

  return function allow() {
    const current = now();
    if (current - windowStart >= windowMs) {
      windowStart = current;
      hits = 0;
    }
    hits += 1;
    return hits <= max;
  };
}

module.exports = { createWindowLimiter };
