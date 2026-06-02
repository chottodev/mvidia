const { VIDEO_STATUS } = require('./videoConstants');

/** @param {import('mongoose').LeanDocument<any>} doc */
function serializeVideo(doc) {
  const status = doc.status || VIDEO_STATUS.READY;
  const base = {
    publicId: doc.publicId,
    title: doc.title,
    status,
    createdAt: doc.createdAt,
  };

  if (status === VIDEO_STATUS.READY) {
    return {
      ...base,
      mimeType: doc.mimeType || 'video/mp4',
      sizeBytes: doc.sizeBytes,
      sourceSizeBytes: doc.sourceSizeBytes,
    };
  }

  if (status === VIDEO_STATUS.FAILED) {
    return {
      ...base,
      processingStep: doc.processingStep,
      errorMessage: doc.errorMessage || 'Ошибка обработки',
      mimeType: doc.sourceMimeType,
      sizeBytes: null,
      sourceSizeBytes: doc.sourceSizeBytes,
    };
  }

  return {
    ...base,
    processingStep: doc.processingStep,
    mimeType: doc.sourceMimeType,
    sizeBytes: null,
    sourceSizeBytes: doc.sourceSizeBytes,
  };
}

function isVideoReady(doc) {
  return (doc.status || VIDEO_STATUS.READY) === VIDEO_STATUS.READY;
}

module.exports = { serializeVideo, isVideoReady };
