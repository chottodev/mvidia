const mongoose = require('mongoose');
const Video = require('./Video');
const User = require('./User');
const ConversionLog = require('./ConversionLog');
const { CONVERSION_LOG_STATUS } = require('./conversionLogConstants');
const { serializeConversionLog } = require('./serializeConversionLog');
const {
  VIDEO_STATUS,
  PROCESSING_STEP,
  VIDEO_VISIBILITY,
  VIDEO_TITLE_MAX,
  VIDEO_DESCRIPTION_MAX,
  ALLOWED_UPLOAD_EXTENSIONS,
} = require('./videoConstants');
const { canViewFullVideo, normalizeVisibility, serializeVideoHidden } = require('./videoAccess');
const videoPaths = require('./videoPaths');
const { serializeVideo, isVideoReady } = require('./serializeVideo');
const { serializeUser } = require('./serializeUser');
const { createLogger, refreshLogLevel } = require('./logger');

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

  await Video.updateMany(
    { visibility: { $exists: false } },
    { $set: { visibility: VIDEO_VISIBILITY.PUBLIC, description: '' } }
  );
  await Video.updateMany(
    { description: { $exists: false } },
    { $set: { description: '' } }
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
  User,
  ConversionLog,
  CONVERSION_LOG_STATUS,
  serializeConversionLog,
  VIDEO_STATUS,
  PROCESSING_STEP,
  VIDEO_VISIBILITY,
  VIDEO_TITLE_MAX,
  VIDEO_DESCRIPTION_MAX,
  ALLOWED_UPLOAD_EXTENSIONS,
  videoPaths,
  serializeVideo,
  serializeUser,
  isVideoReady,
  canViewFullVideo,
  normalizeVisibility,
  serializeVideoHidden,
  createLogger,
  refreshLogLevel,
};
