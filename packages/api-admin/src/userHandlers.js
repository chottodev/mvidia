const mongoose = require('mongoose');
const { serializeUser } = require('db');
const { normalizeRuPhone } = require('../../api-user/src/phone');
const { validatePassword, hashPassword } = require('../../api-user/src/password');

function validateName(name) {
  const n = String(name || '').trim();
  if (n.length < 1 || n.length > 100) {
    return 'Имя: от 1 до 100 символов';
  }
  return null;
}

function userIdParam(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return id;
}

async function listUsers(req, res) {
  const { User } = this.dependencies;
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const [total, rows] = await Promise.all([
    User.countDocuments(),
    User.find().sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
  ]);

  return res.status(200).json({
    total,
    items: rows.map((doc) => serializeUser(doc)),
  });
}

async function getUserById(req, res) {
  const { User, Video } = this.dependencies;
  const id = userIdParam(req.params.id);
  if (!id) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  const doc = await User.findById(id).lean();
  if (!doc) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  const videoCount = await Video.countDocuments({ authorUserId: doc._id });

  return res.status(200).json({
    ...serializeUser(doc),
    videoCount,
  });
}

async function patchUser(req, res, next) {
  const { User } = this.dependencies;
  const id = userIdParam(req.params.id);
  if (!id) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  const body = req.body || {};
  if (body.name === undefined && body.phone === undefined && body.password === undefined) {
    return res.status(400).json({ message: 'Укажите name, phone и/или password' });
  }

  try {
    const doc = await User.findById(id);
    if (!doc) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (body.name !== undefined) {
      const nameErr = validateName(body.name);
      if (nameErr) return res.status(400).json({ message: nameErr });
      doc.name = String(body.name).trim();
    }

    if (body.phone !== undefined) {
      const phone = normalizeRuPhone(body.phone);
      if (!phone) {
        return res.status(400).json({ message: 'Некорректный номер телефона (Россия, +7)' });
      }
      if (phone !== doc.phone) {
        const taken = await User.findOne({ phone, _id: { $ne: doc._id } }).lean();
        if (taken) {
          return res.status(409).json({ message: 'Этот номер уже зарегистрирован' });
        }
        doc.phone = phone;
      }
    }

    if (body.password !== undefined && body.password !== '') {
      const passErr = validatePassword(body.password);
      if (passErr) return res.status(400).json({ message: passErr });
      doc.passwordHash = await hashPassword(body.password);
    }

    await doc.save();
    return res.status(200).json(serializeUser(doc));
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(409).json({ message: 'Этот номер уже зарегистрирован' });
    }
    return next(e);
  }
}

async function deleteUser(req, res) {
  const { User, Video } = this.dependencies;
  const id = userIdParam(req.params.id);
  if (!id) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  const doc = await User.findByIdAndDelete(id);
  if (!doc) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  await Video.updateMany({ authorUserId: doc._id }, { $set: { authorUserId: null } });

  return res.status(204).send();
}

module.exports = {
  listUsers,
  getUserById,
  patchUser,
  deleteUser,
};
