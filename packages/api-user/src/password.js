const bcrypt = require('bcryptjs');

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])[a-zA-Z0-9]{6}$/;
const BCRYPT_ROUNDS = 10;

function validatePassword(password) {
  const p = String(password || '');
  if (!PASSWORD_RE.test(p)) {
    return 'Пароль: ровно 6 символов (латиница a-z, A-Z и цифры)';
  }
  return null;
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = { validatePassword, hashPassword, verifyPassword, PASSWORD_RE };
