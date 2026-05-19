const path = require('path');
const fs = require('fs/promises');
const fsc = require('fs');
const { randomUUID } = require('crypto');
const multer = require('multer');
const { customAlphabet } = require('nanoid');

const publicIdAlphabet =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const createPublicId = customAlphabet(publicIdAlphabet, 20);

const ONE_GB = 1024 * 1024 * 1024;

function isMp4Upload(file) {
  if (!file) return false;
  const name = (file.originalname || '').toLowerCase();
  if (!name.endsWith('.mp4')) return false;
  const mt = (file.mimetype || '').toLowerCase();
  return mt === 'video/mp4' || mt === 'application/octet-stream';
}

function createMultipartMiddleware(uploadDirAbs) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadDirAbs);
    },
    filename: (_req, file, cb) => {
      const internal = `${randomUUID()}.mp4`;
      cb(null, internal);
    },
  });
  const m = multer({
    storage,
    limits: { fileSize: ONE_GB, files: 8, fields: 20 },
  });
  return function multipartUser(req, res, next) {
    m.any()(req, res, function onMulter(err) {
      if (err) return next(err);
      const files = req.files || [];
      const filesMap = files.reduce((acc, f) => {
        const list = acc[f.fieldname] || [];
        list.push(f);
        acc[f.fieldname] = list;
        return acc;
      }, {});
      Object.keys(filesMap).forEach((fieldname) => {
        const list = filesMap[fieldname];
        req.body[fieldname] = list.length > 1 ? list.map(() => '') : '';
      });
      next();
    });
  };
}

async function createVideo(req, res, next) {
  const { Video } = this.dependencies;

  const fileField = (req.files || []).find((f) => f.fieldname === 'file');
  const title = (req.body && String(req.body.title || '').trim()) || '';

  if (!fileField) {
    return res.status(400).json({ message: 'Поле file обязательно' });
  }
  if (!title) {
    await fs.unlink(fileField.path).catch(() => {});
    return res.status(400).json({ message: 'Название обязательно' });
  }
  if (!isMp4Upload(fileField)) {
    await fs.unlink(fileField.path).catch(() => {});
    return res.status(400).json({
      message: 'Разрешён только MP4 (video/mp4, .mp4)',
    });
  }

  const storageFileName = fileField.filename;
  let publicId = createPublicId();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await Video.create({
        publicId,
        storageFileName,
        title,
        mimeType: 'video/mp4',
        sizeBytes: fileField.size,
      });
      return res.status(201).json({
        publicId,
        title,
        sizeBytes: fileField.size,
        mimeType: 'video/mp4',
      });
    } catch (e) {
      if (e && e.code === 11000) {
        publicId = createPublicId();
        continue;
      }
      await fs.unlink(fileField.path).catch(() => {});
      return next(e);
    }
  }
  await fs.unlink(fileField.path).catch(() => {});
  return res.status(500).json({ message: 'Не удалось создать запись' });
}

async function getVideoByPublicId(req, res) {
  const { Video } = this.dependencies;
  const { publicId } = req.params;
  const doc = await Video.findOne({ publicId }).lean();
  if (!doc) {
    return res.status(404).json({ message: 'Видео не найдено' });
  }
  return res.status(200).json({
    publicId: doc.publicId,
    title: doc.title,
    sizeBytes: doc.sizeBytes,
    mimeType: doc.mimeType,
    createdAt: doc.createdAt,
  });
}

async function streamVideoFile(req, res, next) {
  const { Video, uploadDirAbs } = this.dependencies;
  const { publicId } = req.params;
  const doc = await Video.findOne({ publicId }).lean();
  if (!doc) {
    return res.status(404).json({ message: 'Видео не найдено' });
  }
  const filePath = path.join(uploadDirAbs, doc.storageFileName);

  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return res.status(404).json({ message: 'Файл не найден на диске' });
  }

  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/i.exec(range);
    if (!m) {
      res.status(416).set('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : fileSize - 1;
    if (Number.isNaN(start) || start < 0) start = 0;
    if (Number.isNaN(end) || end >= fileSize) end = fileSize - 1;
    if (start > end) {
      res.status(416).set('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }
    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', String(chunkSize));
    res.setHeader('Content-Type', 'video/mp4');
    const stream = fsc.createReadStream(filePath, { start, end });
    stream.on('error', next);
    return stream.pipe(res);
  }

  res.status(200);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', String(fileSize));
  res.setHeader('Content-Type', 'video/mp4');
  const stream = fsc.createReadStream(filePath);
  stream.on('error', next);
  return stream.pipe(res);
}

module.exports = {
  createMultipartMiddleware,
  operations: {
    createVideo,
    getVideoByPublicId,
    streamVideoFile,
  },
};
