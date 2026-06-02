const {
  Video,
  VIDEO_STATUS,
  PROCESSING_STEP,
  videoPaths,
} = require('db');
const { produceDeliveryMp4, deliveryFileSize } = require('./transcode');
const { generatePosterFromVideo } = require('./poster');

async function processTranscodeJob(publicId, uploadDirAbs) {
  const doc = await Video.findOne({ publicId });
  if (!doc) {
    throw new Error(`Video not found: ${publicId}`);
  }
  if (doc.status === VIDEO_STATUS.READY) {
    return { skipped: true };
  }

  doc.processingStep = PROCESSING_STEP.CONVERTING;
  await doc.save();

  const sourceAbs = videoPaths.sourcePath(uploadDirAbs, doc.sourceFileName);
  const deliveryAbs = videoPaths.deliveryPath(uploadDirAbs, doc.storageFileName);
  const posterAbs = videoPaths.posterPath(uploadDirAbs, doc.storageFileName);

  try {
    await produceDeliveryMp4(sourceAbs, deliveryAbs);
    const sizeBytes = await deliveryFileSize(deliveryAbs);

    doc.processingStep = PROCESSING_STEP.FINALIZING;
    await doc.save();

    if (posterAbs) {
      await generatePosterFromVideo(deliveryAbs, posterAbs);
    }

    doc.status = VIDEO_STATUS.READY;
    doc.processingStep = undefined;
    doc.errorMessage = undefined;
    doc.sizeBytes = sizeBytes;
    doc.mimeType = 'video/mp4';
    await doc.save();

    return { publicId, sizeBytes };
  } catch (e) {
    doc.status = VIDEO_STATUS.FAILED;
    doc.errorMessage = (e && e.message) || 'Ошибка конвертации';
    doc.processingStep = undefined;
    await doc.save();
    throw e;
  }
}

module.exports = { processTranscodeJob };
