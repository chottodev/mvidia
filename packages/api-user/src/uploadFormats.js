const path = require('path');
const { ALLOWED_UPLOAD_EXTENSIONS } = require('db');

function extensionFromOriginalName(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  return ext || '';
}

function isAllowedUpload(file) {
  if (!file) return false;
  const ext = extensionFromOriginalName(file.originalname);
  if (!ext || !ALLOWED_UPLOAD_EXTENSIONS[ext]) return false;
  const mt = (file.mimetype || '').toLowerCase();
  const allowed = ALLOWED_UPLOAD_EXTENSIONS[ext];
  return allowed.includes(mt) || mt === 'application/octet-stream' || !mt;
}

function allowedFormatsHint() {
  return Object.keys(ALLOWED_UPLOAD_EXTENSIONS).join(', ');
}

module.exports = {
  extensionFromOriginalName,
  isAllowedUpload,
  allowedFormatsHint,
};
