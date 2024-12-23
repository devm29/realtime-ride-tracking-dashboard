/**
 * Validates a { lat, lng } payload from REST or WebSocket.
 * Returns { lat, lng } on success or { error } describing the first problem.
 */
function parseLocation(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Invalid location data: expected an object with lat and lng' };
  }

  const { lat, lng } = payload;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: 'Invalid location data: lat and lng must be numbers' };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: 'Invalid coordinates: lat must be -90 to 90, lng must be -180 to 180' };
  }

  return { lat, lng };
}

module.exports = { parseLocation };
