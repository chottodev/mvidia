const mongoose = require('mongoose');
const Video = require('./Video');
const { VIDEO_STATUS, PROCESSING_STEP, ALLOWED_UPLOAD_EXTENSIONS } = require('./videoConstants');
const videoPaths = require('./videoPaths');
const { serializeVideo, isVideoReady } = require('./serializeVideo');

/**
 * @param {string} uri
 */
async function connect(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
}

async function migrateVideosWithoutStatus() {
  await Video.updateMany(
    { status: { $exists: false } },
    { $set: { status: VIDEO_STATUS.READY } }
  );

  const legacy = await Video.find({ sourceFileName: { $exists: false } });
  for (const doc of legacy) {
    doc.sourceFileName = doc.storageFileName;
    doc.sourceMimeType = doc.mimeType || 'video/mp4';
    doc.sourceSizeBytes = doc.sizeBytes || 0;
    if (!doc.status) doc.status = VIDEO_STATUS.READY;
    await doc.save();
  }
}

module.exports = {
  connect,
  migrateVideosWithoutStatus,
  Video,
  VIDEO_STATUS,
  PROCESSING_STEP,
  ALLOWED_UPLOAD_EXTENSIONS,
  videoPaths,
  serializeVideo,
  isVideoReady,
};
