const path = require('path');
const fs = require('fs/promises');
const { serializeVideo, videoPaths } = require('db');
const { resolvePublicSiteUrlFromEnv } = require('../../api-user/src/publicSiteUrl');

async function getConfig(req, res) {
  const publicSiteUrl = resolvePublicSiteUrlFromEnv();
  const userApiDocsUrl = publicSiteUrl ? `${publicSiteUrl}/api-docs` : null;
  return res.status(200).json({
    publicSiteUrl: publicSiteUrl || null,
    userApiDocsUrl,
  });
}

async function listVideos(req, res) {
  const { Video } = this.dependencies;
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const [total, rows] = await Promise.all([
    Video.countDocuments(),
    Video.find()
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean(),
  ]);

  const items = rows.map((doc) => serializeVideo(doc));

  return res.status(200).json({ total, items });
}

async function deleteVideo(req, res) {
  const { Video, uploadDirAbs } = this.dependencies;
  const { publicId } = req.params;
  const doc = await Video.findOneAndDelete({ publicId });
  if (!doc) {
    return res.status(404).json({ message: 'Видео не найдено' });
  }
  await fs.unlink(videoPaths.deliveryPath(uploadDirAbs, doc.storageFileName)).catch(() => {});
  if (doc.sourceFileName) {
    await fs.unlink(videoPaths.sourcePath(uploadDirAbs, doc.sourceFileName)).catch(() => {});
  }
  const poster = videoPaths.posterPath(uploadDirAbs, doc.storageFileName);
  if (poster) await fs.unlink(poster).catch(() => {});
  return res.status(204).send();
}

module.exports = {
  operations: {
    getConfig,
    listVideos,
    deleteVideo,
  },
};
