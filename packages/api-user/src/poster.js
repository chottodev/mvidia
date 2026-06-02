const fs = require('fs/promises');
const { videoPaths } = require('db');

async function posterExists(uploadDirAbs, storageFileName) {
  const p = videoPaths.posterPath(uploadDirAbs, storageFileName);
  if (!p) return false;
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

module.exports = { posterExists };
