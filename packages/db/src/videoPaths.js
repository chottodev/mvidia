const path = require('path');

const SOURCES_SUBDIR = 'sources';
const POSTERS_SUBDIR = 'posters';

function deliveryFileName(internalId) {
  return `${internalId}.mp4`;
}

function sourceRelativePath(internalId, extWithDot) {
  const ext = extWithDot.startsWith('.') ? extWithDot : `.${extWithDot}`;
  return path.posix.join(SOURCES_SUBDIR, `${internalId}${ext}`);
}

function posterFileName(storageFileName) {
  if (!storageFileName || !/\.mp4$/i.test(storageFileName)) return null;
  return storageFileName.replace(/\.mp4$/i, '.jpg');
}

function deliveryPath(uploadDirAbs, storageFileName) {
  return path.join(uploadDirAbs, storageFileName);
}

function sourcePath(uploadDirAbs, sourceFileName) {
  return path.join(uploadDirAbs, sourceFileName);
}

function posterPath(uploadDirAbs, storageFileName) {
  const name = posterFileName(storageFileName);
  if (!name) return null;
  return path.join(uploadDirAbs, POSTERS_SUBDIR, name);
}

function internalIdFromStorageFileName(storageFileName) {
  const m = /^(.+)\.mp4$/i.exec(storageFileName || '');
  return m ? m[1] : null;
}

module.exports = {
  SOURCES_SUBDIR,
  POSTERS_SUBDIR,
  deliveryFileName,
  sourceRelativePath,
  posterFileName,
  deliveryPath,
  sourcePath,
  posterPath,
  internalIdFromStorageFileName,
};
