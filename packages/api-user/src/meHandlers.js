const { serializeVideo, serializeUser, createLogger } = require('db');
const { validatePassword, hashPassword, verifyPassword } = require('./password');

const log = createLogger('auth');

function validateName(name) {
  const n = String(name || '').trim();
  if (n.length < 1 || n.length > 100) {
    return 'Имя: от 1 до 100 символов';
  }
  return null;
}

async function getMe(req, res) {
  return res.status(200).json(serializeUser(req.mvidiaUser));
}

async function patchMe(req, res, next) {
  const { User } = this.dependencies;
  const body = req.body || {};
  if (body.name === undefined) {
    return res.status(400).json({ message: 'Укажите name' });
  }
  const nameErr = validateName(body.name);
  if (nameErr) {
    return res.status(400).json({ message: nameErr });
  }

  try {
    const doc = await User.findById(req.mvidiaUser._id);
    if (!doc) {
      return res.status(401).json({ message: 'Требуется авторизация' });
    }
    doc.name = String(body.name).trim();
    await doc.save();
    log.info('профиль: имя обновлено', { userId: String(doc._id) });
    return res.status(200).json(serializeUser(doc));
  } catch (e) {
    return next(e);
  }
}

async function patchMePassword(req, res, next) {
  const { User } = this.dependencies;
  const body = req.body || {};
  const currentPassword = body.currentPassword;
  const newPassword = body.newPassword;

  const curErr = validatePassword(currentPassword);
  const newErr = validatePassword(newPassword);
  if (curErr || newErr) {
    return res.status(400).json({
      message: curErr || newErr,
    });
  }

  try {
    const doc = await User.findById(req.mvidiaUser._id);
    if (!doc) {
      return res.status(401).json({ message: 'Требуется авторизация' });
    }
    const ok = await verifyPassword(currentPassword, doc.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: 'Неверный текущий пароль' });
    }
    doc.passwordHash = await hashPassword(newPassword);
    await doc.save();
    log.info('профиль: пароль обновлён', { userId: String(doc._id) });
    return res.status(204).send();
  } catch (e) {
    return next(e);
  }
}

async function listMyVideos(req, res) {
  const { Video } = this.dependencies;
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const userId = req.mvidiaUser._id;

  const [total, rows] = await Promise.all([
    Video.countDocuments({ authorUserId: userId }),
    Video.find({ authorUserId: userId })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean(),
  ]);

  const items = rows.map((doc) => serializeVideo(doc));
  return res.status(200).json({ total, items });
}

module.exports = {
  getMe,
  patchMe,
  patchMePassword,
  listMyVideos,
};
