const path = require('path');
const fs = require('fs/promises');
const fsc = require('fs');
const { randomUUID } = require('crypto');
const multer = require('multer');
const { customAlphabet } = require('nanoid');
const {
  VIDEO_STATUS,
  PROCESSING_STEP,
  videoPaths,
  serializeVideo,
  isVideoReady,
} = require('db');
const { enqueueTranscode } = require('./queue');
const {
  extensionFromOriginalName,
  isAllowedUpload,
  allowedFormatsHint,
} = require('./uploadFormats');

const publicIdAlphabet =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const createPublicId = customAlphabet(publicIdAlphabet, 20);

const ONE_GB = 1024 * 1024 * 1024;

function createMultipartMiddleware(uploadDirAbs) {
  const sourcesDir = path.join(uploadDirAbs, videoPaths.SOURCES_SUBDIR);
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, sourcesDir);
    },
    filename: (req, file, cb) => {
      const ext = extensionFromOriginalName(file.originalname);
      const internalId = randomUUID();
      req.mvidiaUpload = { internalId, ext };
      cb(null, `${internalId}${ext}`);
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

async function cleanupFailedUpload(uploadDirAbs, { sourceAbs, storageFileName }) {
  if (sourceAbs) await fs.unlink(sourceAbs).catch(() => {});
  if (storageFileName) {
    const delivery = videoPaths.deliveryPath(uploadDirAbs, storageFileName);
    await fs.unlink(delivery).catch(() => {});
    const poster = videoPaths.posterPath(uploadDirAbs, storageFileName);
    if (poster) await fs.unlink(poster).catch(() => {});
  }
}

async function createVideo(req, res, next) {
  const { Video, uploadDirAbs } = this.dependencies;

  const fileField = (req.files || []).find((f) => f.fieldname === 'file');
  const title = (req.body && String(req.body.title || '').trim()) || '';
  const uploadMeta = req.mvidiaUpload;

  if (!fileField) {
    return res.status(400).json({ message: 'Поле file обязательно' });
  }
  if (!title) {
    await fs.unlink(fileField.path).catch(() => {});
    return res.status(400).json({ message: 'Название обязательно' });
  }
  if (!isAllowedUpload(fileField)) {
    await fs.unlink(fileField.path).catch(() => {});
    return res.status(400).json({
      message: `Разрешены форматы: ${allowedFormatsHint()}`,
    });
  }
  if (!uploadMeta || !uploadMeta.internalId) {
    await fs.unlink(fileField.path).catch(() => {});
    return res.status(400).json({ message: 'Не удалось принять файл' });
  }

  const { internalId, ext } = uploadMeta;
  const sourceFileName = videoPaths.sourceRelativePath(internalId, ext);
  const storageFileName = videoPaths.deliveryFileName(internalId);
  const sourceAbs = fileField.path;

  let publicId = createPublicId();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await Video.create({
        publicId,
        storageFileName,
        sourceFileName,
        sourceMimeType: fileField.mimetype || 'application/octet-stream',
        sourceSizeBytes: fileField.size,
        title,
        mimeType: 'video/mp4',
        sizeBytes: 0,
        status: VIDEO_STATUS.NOT_READY,
        processingStep: PROCESSING_STEP.UPLOADED,
      });

      try {
        await enqueueTranscode(publicId);
      } catch (queueErr) {
        await Video.deleteOne({ publicId });
        await cleanupFailedUpload(uploadDirAbs, { sourceAbs, storageFileName });
        return res.status(503).json({
          message: 'Очередь обработки недоступна. Проверьте REDIS_URL.',
        });
      }

      return res.status(201).json({
        publicId,
        title,
        status: VIDEO_STATUS.NOT_READY,
        processingStep: PROCESSING_STEP.QUEUED,
        sourceSizeBytes: fileField.size,
      });
    } catch (e) {
      if (e && e.code === 11000) {
        publicId = createPublicId();
        continue;
      }
      await cleanupFailedUpload(uploadDirAbs, { sourceAbs, storageFileName });
      return next(e);
    }
  }
  await cleanupFailedUpload(uploadDirAbs, { sourceAbs, storageFileName });
  return res.status(500).json({ message: 'Не удалось создать запись' });
}

async function getVideoByPublicId(req, res) {
  const { Video } = this.dependencies;
  const { publicId } = req.params;
  const doc = await Video.findOne({ publicId }).lean();
  if (!doc) {
    return res.status(404).json({ message: 'Видео не найдено' });
  }
  return res.status(200).json(serializeVideo(doc));
}

async function streamVideoFile(req, res, next) {
  const { Video, uploadDirAbs } = this.dependencies;
  const { publicId } = req.params;
  const doc = await Video.findOne({ publicId }).lean();
  if (!doc || !isVideoReady(doc)) {
    return res.status(404).json({ message: 'Видео не найдено' });
  }
  const filePath = videoPaths.deliveryPath(uploadDirAbs, doc.storageFileName);

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

async function streamVideoPoster(req, res, next) {
  const { Video, uploadDirAbs } = this.dependencies;
  const { publicId } = req.params;
  const doc = await Video.findOne({ publicId }).lean();
  if (!doc || !isVideoReady(doc)) {
    return res.status(404).json({ message: 'Постер не найден' });
  }
  const filePath = videoPaths.posterPath(uploadDirAbs, doc.storageFileName);
  if (!filePath) {
    return res.status(404).json({ message: 'Постер не найден' });
  }

  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return res.status(404).json({ message: 'Постер не найден' });
  }

  res.status(200);
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader('Cache-Control', 'public, max-age=86400');
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
    streamVideoPoster,
  },
};
