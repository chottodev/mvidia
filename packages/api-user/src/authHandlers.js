const { User, serializeUser, createLogger } = require('db');
const { normalizeRuPhone, maskPhone } = require('./phone');
const { validatePassword, hashPassword, verifyPassword } = require('./password');
const { signToken } = require('./jwt');
const { checkAuthRateLimit } = require('./authRateLimit');

const log = createLogger('auth');

function validateName(name) {
  const n = String(name || '').trim();
  if (n.length < 1 || n.length > 100) {
    return 'Имя: от 1 до 100 символов';
  }
  return null;
}

async function register(req, res, next) {
  if (!checkAuthRateLimit(req)) {
    return res.status(429).json({ message: 'Слишком много попыток. Попробуйте позже.' });
  }

  const body = req.body || {};
  const phone = normalizeRuPhone(body.phone);
  const password = body.password;
  const nameErr = validateName(body.name);
  const passErr = validatePassword(password);

  if (!phone) {
    return res.status(400).json({ message: 'Некорректный номер телефона (Россия, +7)' });
  }
  if (passErr) {
    return res.status(400).json({ message: passErr });
  }
  if (nameErr) {
    return res.status(400).json({ message: nameErr });
  }

  const name = String(body.name).trim();

  try {
    const existing = await User.findOne({ phone }).lean();
    if (existing) {
      return res.status(409).json({ message: 'Этот номер уже зарегистрирован' });
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({ phone, passwordHash, name });
    const token = signToken(user._id);

    log.info('регистрация', { phone: maskPhone(phone), userId: String(user._id) });

    return res.status(201).json({
      token,
      user: serializeUser(user),
    });
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(409).json({ message: 'Этот номер уже зарегистрирован' });
    }
    return next(e);
  }
}

async function login(req, res, next) {
  if (!checkAuthRateLimit(req)) {
    return res.status(429).json({ message: 'Слишком много попыток. Попробуйте позже.' });
  }

  const body = req.body || {};
  const phone = normalizeRuPhone(body.phone);
  const password = body.password;

  if (!phone || !password) {
    return res.status(400).json({ message: 'Укажите телефон и пароль' });
  }

  const user = await User.findOne({ phone });
  if (!user) {
    log.info('вход: не найден', { phone: maskPhone(phone) });
    return res.status(401).json({ message: 'Неверный телефон или пароль' });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    log.info('вход: неверный пароль', { phone: maskPhone(phone) });
    return res.status(401).json({ message: 'Неверный телефон или пароль' });
  }

  const token = signToken(user._id);
  log.info('вход', { phone: maskPhone(phone), userId: String(user._id) });

  return res.status(200).json({
    token,
    user: serializeUser(user),
  });
}

async function logout(req, res) {
  return res.status(204).send();
}

module.exports = {
  register,
  login,
  logout,
};
