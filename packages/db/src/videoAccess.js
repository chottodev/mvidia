const { VIDEO_VISIBILITY } = require('./videoConstants');

function normalizeVisibility(v) {
  if (v === VIDEO_VISIBILITY.PRIVATE) return VIDEO_VISIBILITY.PRIVATE;
  return VIDEO_VISIBILITY.PUBLIC;
}

/** @param {import('mongoose').LeanDocument<any> | null | undefined} doc */
function canViewFullVideo(doc, userId) {
  if (!doc) return false;
  const visibility = normalizeVisibility(doc.visibility);
  if (visibility === VIDEO_VISIBILITY.PUBLIC) return true;
  if (!userId || !doc.authorUserId) return false;
  return String(doc.authorUserId) === String(userId);
}

function serializeVideoHidden(publicId) {
  return {
    publicId,
    visibility: VIDEO_VISIBILITY.PRIVATE,
    hidden: true,
    message: 'Видео существует, но скрыто автором',
  };
}

module.exports = {
  canViewFullVideo,
  normalizeVisibility,
  serializeVideoHidden,
};
