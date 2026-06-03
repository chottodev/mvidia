const hits = new Map();

function windowMs() {
  return parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10);
}

function maxHits() {
  return parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10);
}

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function checkAuthRateLimit(req) {
  const key = clientKey(req);
  const now = Date.now();
  const win = windowMs();
  const max = maxHits();
  let bucket = hits.get(key);
  if (!bucket || now - bucket.start > win) {
    bucket = { start: now, count: 0 };
  }
  bucket.count += 1;
  hits.set(key, bucket);
  return bucket.count <= max;
}

module.exports = { checkAuthRateLimit };
