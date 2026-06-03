const jwt = require('jsonwebtoken');

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || String(s).length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET не задан или слишком короткий');
    }
    return 'mvidia-dev-jwt-secret-change-me';
  }
  return s;
}

function getExpiresIn() {
  return process.env.JWT_EXPIRES_IN || '7d';
}

function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, getSecret(), { expiresIn: getExpiresIn() });
}

function verifyToken(token) {
  try {
    const payload = jwt.verify(token, getSecret());
    if (!payload || !payload.sub) return null;
    return String(payload.sub);
  } catch {
    return null;
  }
}

module.exports = { signToken, verifyToken };
