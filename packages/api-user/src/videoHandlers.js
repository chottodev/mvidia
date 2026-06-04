const {
  serializeVideo,
  isVideoReady,
  canViewFullVideo,
  serializeVideoHidden,
  VIDEO_VISIBILITY,
} = require('db');
const { attachOptionalUser } = require('./authMiddleware');
const {
  validateTitle,
  validateDescription,
  parseDescription,
  parseVisibility,
} = require('./videoFields');
const { createLogger } = require('db');

const log = createLogger('user');

function viewerUserId(req) {
  return req.mvidiaUser ? String(req.mvidiaUser._id) : null;
}

async function patchVideo(req, res, next) {
  const { Video } = this.dependencies;
  const { publicId } = req.params;
  const body = req.body || {};

  if (body.title === undefined && body.description === undefined && body.visibility === undefined) {
    return res.status(400).json({ message: 'Укажите title, description и/или visibility' });
  }

  try {
    const doc = await Video.findOne({ publicId });
    if (!doc) {
      return res.status(404).json({ message: 'Видео не найдено' });
    }
    if (!doc.authorUserId) {
      return res.status(403).json({ message: 'Редактирование недоступно' });
    }
    if (String(doc.authorUserId) !== String(req.mvidiaUser._id)) {
      return res.status(403).json({ message: 'Редактирование недоступно' });
    }

    if (body.title !== undefined) {
      const titleErr = validateTitle(body.title);
      if (titleErr) return res.status(400).json({ message: titleErr });
      doc.title = String(body.title).trim();
    }
    if (body.description !== undefined) {
      const descErr = validateDescription(body.description);
      if (descErr) return res.status(400).json({ message: descErr });
      doc.description = parseDescription(body.description);
    }
    if (body.visibility !== undefined) {
      const vis = parseVisibility(body.visibility, { allowPrivate: true });
      if (vis.err && vis.value === null) {
        return res.status(400).json({ message: vis.err });
      }
      doc.visibility = vis.value;
    }

    await doc.save();
    log.info('видео: обновлено автором', {
      publicId,
      visibility: doc.visibility,
    });
    return res.status(200).json(serializeVideo(doc));
  } catch (e) {
    return next(e);
  }
}

async function getVideoByPublicId(req, res) {
  const { Video } = this.dependencies;
  await attachOptionalUser(req, this.dependencies);

  const { publicId } = req.params;
  const isPoll = req.get('x-mvidia-poll') === '1';
  const userId = viewerUserId(req);

  const doc = await Video.findOne({ publicId }).lean();
  if (!doc) {
    log.info('метаданные: не найдено', { publicId, poll: isPoll });
    return res.status(404).json({ message: 'Видео не найдено' });
  }

  if (!canViewFullVideo(doc, userId)) {
    log.info('метаданные: скрыто', { publicId, poll: isPoll });
    return res.status(200).json(serializeVideoHidden(publicId));
  }

  const payload = serializeVideo(doc);
  if (doc.authorUserId && userId && String(doc.authorUserId) === userId) {
    payload.canEdit = true;
  }
  if (!isPoll) {
    log.info('метаданные: ответ', {
      publicId,
      status: payload.status,
      visibility: payload.visibility,
    });
  } else {
    log.debug('метаданные: poll', {
      publicId,
      status: payload.status,
      processingStep: payload.processingStep,
    });
  }
  return res.status(200).json(payload);
}

async function assertCanStream(req, res) {
  const { Video } = this.dependencies;
  await attachOptionalUser(req, this.dependencies);

  const { publicId } = req.params;
  const doc = await Video.findOne({ publicId }).lean();
  if (!doc || !isVideoReady(doc) || !canViewFullVideo(doc, viewerUserId(req))) {
    log.info('поток: недоступно', { publicId, status: doc?.status });
    return { doc: null };
  }
  return { doc };
}

module.exports = {
  patchVideo,
  getVideoByPublicId,
  assertCanStream,
  viewerUserId,
};
