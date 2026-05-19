const path = require('path');
const fs = require('fs/promises');

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
      .select({ publicId: 1, title: 1, sizeBytes: 1, mimeType: 1, createdAt: 1 })
      .lean(),
  ]);

  const items = rows.map((doc) => ({
    publicId: doc.publicId,
    title: doc.title,
    sizeBytes: doc.sizeBytes,
    mimeType: doc.mimeType,
    createdAt: doc.createdAt,
  }));

  return res.status(200).json({ total, items });
}

async function deleteVideo(req, res) {
  const { Video, uploadDirAbs } = this.dependencies;
  const { publicId } = req.params;
  const doc = await Video.findOneAndDelete({ publicId });
  if (!doc) {
    return res.status(404).json({ message: 'Видео не найдено' });
  }
  const filePath = path.join(uploadDirAbs, doc.storageFileName);
  await fs.unlink(filePath).catch(() => {});
  return res.status(204).send();
}

module.exports = {
  operations: {
    listVideos,
    deleteVideo,
  },
};
