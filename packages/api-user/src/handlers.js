const path = require('path');
const fs = require('fs/promises');
const fsc = require('fs');
const { randomUUID } = require('crypto');
const multer = require('multer');
const { customAlphabet } = require('nanoid');
const {
  VIDEO_STATUS,
  PROCESSING_STEP,
  VIDEO_VISIBILITY,
  videoPaths,
  isVideoReady,
  normalizeVisibility,
} = require('db');
const {
  validateTitle,
  validateDescription,
  parseDescription,
  parseVisibility,
} = require('./videoFields');
const videoHandlers = require('./videoHandlers');
const { enqueueTranscode } = require('./queue');
const { createLogger } = require('db');

const log = createLogger('user');
const {
  extensionFromOriginalName,
  isAllowedUpload,
  allowedFormatsHint,
} = require('./uploadFormats');

const publicIdAlphabet =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const createPublicId = customAlphabet(publicIdAlphabet, 20);

const ONE_GB = 1024 * 1024 * 1024;

function createMultipartMiddleware(uploadDirAbs, dependencies) {
  const { attachOptionalUser } = require('./authMiddleware');
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
      attachOptionalUser(req, dependencies)
        .then(() => next())
        .catch(next);
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
  const rawTitle = req.body && req.body.title;
  const uploadMeta = req.mvidiaUpload;

  if (!fileField) {
    log.warn('загрузка: отклонена — нет file');
    return res.status(400).json({ message: 'Поле file обязательно' });
  }

  const titleErr = validateTitle(rawTitle);
  if (titleErr) {
    await fs.unlink(fileField.path).catch(() => {});
    log.warn('загрузка: отклонена — название', { message: titleErr });
    return res.status(400).json({ message: titleErr });
  }
  const title = String(rawTitle).trim();

  const descErr = validateDescription(req.body && req.body.description);
  if (descErr) {
    await fs.unlink(fileField.path).catch(() => {});
    return res.status(400).json({ message: descErr });
  }
  const description = parseDescription(req.body && req.body.description);

  const authorUser = req.mvidiaUser || null;
  const vis = parseVisibility(req.body && req.body.visibility, {
    allowPrivate: !!authorUser,
  });
  if (vis.err && vis.value === null) {
    await fs.unlink(fileField.path).catch(() => {});
    return res.status(400).json({ message: vis.err });
  }
  const visibility = vis.value;
  if (!isAllowedUpload(fileField)) {
    await fs.unlink(fileField.path).catch(() => {});
    log.warn('загрузка: неподдерживаемый формат', {
      originalName: fileField.originalname,
      mimeType: fileField.mimetype,
    });
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

  log.info('загрузка: файл принят', {
    originalName: fileField.originalname,
    ext,
    internalId,
    sourceFileName,
    sizeBytes: fileField.size,
    mimeType: fileField.mimetype,
    title,
  });

  const authorFields = authorUser
    ? {
        authorUserId: authorUser._id,
        authorNameSnapshot: String(authorUser.name).trim(),
      }
    : {};

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
        description,
        visibility: normalizeVisibility(visibility),
        mimeType: 'video/mp4',
        sizeBytes: 0,
        status: VIDEO_STATUS.NOT_READY,
        processingStep: PROCESSING_STEP.UPLOADED,
        ...authorFields,
      });

      log.info('загрузка: запись в БД', {
        publicId,
        status: VIDEO_STATUS.NOT_READY,
        processingStep: PROCESSING_STEP.UPLOADED,
        authorUserId: authorUser ? String(authorUser._id) : null,
      });

      try {
        await enqueueTranscode(publicId);
      } catch (queueErr) {
        log.error('загрузка: очередь недоступна', {
          publicId,
          error: queueErr instanceof Error ? queueErr.message : String(queueErr),
        });
        await Video.deleteOne({ publicId });
        await cleanupFailedUpload(uploadDirAbs, { sourceAbs, storageFileName });
        return res.status(503).json({
          message: 'Очередь обработки недоступна. Проверьте REDIS_URL.',
        });
      }

      log.info('загрузка: завершена, ответ клиенту', {
        publicId,
        status: VIDEO_STATUS.NOT_READY,
        processingStep: PROCESSING_STEP.QUEUED,
      });

      return res.status(201).json({
        publicId,
        title,
        description,
        visibility: normalizeVisibility(visibility),
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

async function streamVideoFile(req, res, next) {
  const { uploadDirAbs } = this.dependencies;
  const { publicId } = req.params;
  const { doc } = await videoHandlers.assertCanStream.call(this, req, res);
  if (!doc) {
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
    log.debug('воспроизведение: range', { publicId, range, fileSize });
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

  log.info('воспроизведение: отдача файла', { publicId, fileSize });
  res.status(200);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', String(fileSize));
  res.setHeader('Content-Type', 'video/mp4');
  const stream = fsc.createReadStream(filePath);
  stream.on('error', next);
  return stream.pipe(res);
}

async function streamVideoPoster(req, res, next) {
  const { uploadDirAbs } = this.dependencies;
  const { publicId } = req.params;
  const { doc } = await videoHandlers.assertCanStream.call(this, req, res);
  if (!doc) {
    log.debug('постер: недоступен', { publicId });
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

  log.debug('постер: отдача', { publicId, sizeBytes: stat.size });
  res.status(200);
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader('Cache-Control', 'public, max-age=86400');
  const stream = fsc.createReadStream(filePath);
  stream.on('error', next);
  return stream.pipe(res);
}

const authHandlers = require('./authHandlers');
const meHandlers = require('./meHandlers');

module.exports = {
  createMultipartMiddleware,
  operations: {
    createVideo,
    getVideoByPublicId: videoHandlers.getVideoByPublicId,
    patchVideo: videoHandlers.patchVideo,
    streamVideoFile,
    streamVideoPoster,
    register: authHandlers.register,
    login: authHandlers.login,
    logout: authHandlers.logout,
    getMe: meHandlers.getMe,
    patchMe: meHandlers.patchMe,
    patchMePassword: meHandlers.patchMePassword,
    listMyVideos: meHandlers.listMyVideos,
  },
};
