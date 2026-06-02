const VIDEO_STATUS = {
  NOT_READY: 'not_ready',
  READY: 'ready',
  FAILED: 'failed',
};

const PROCESSING_STEP = {
  UPLOADED: 'uploaded',
  QUEUED: 'queued',
  CONVERTING: 'converting',
  FINALIZING: 'finalizing',
};

/** @type {Record<string, string[]>} */
const ALLOWED_UPLOAD_EXTENSIONS = {
  '.mp4': ['video/mp4', 'application/octet-stream'],
  '.mov': ['video/quicktime', 'video/mp4', 'application/octet-stream'],
  '.mkv': ['video/x-matroska', 'video/mkv', 'application/octet-stream'],
  '.webm': ['video/webm', 'application/octet-stream'],
  '.avi': ['video/x-msvideo', 'video/avi', 'application/octet-stream'],
};

module.exports = {
  VIDEO_STATUS,
  PROCESSING_STEP,
  ALLOWED_UPLOAD_EXTENSIONS,
};
