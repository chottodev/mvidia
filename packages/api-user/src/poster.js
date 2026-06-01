const path = require('path');
const fs = require('fs/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const POSTERS_SUBDIR = 'posters';

function posterFileName(storageFileName) {
  if (!storageFileName || !/\.mp4$/i.test(storageFileName)) return null;
  return storageFileName.replace(/\.mp4$/i, '.jpg');
}

function posterPath(uploadDirAbs, storageFileName) {
  const name = posterFileName(storageFileName);
  if (!name) return null;
  return path.join(uploadDirAbs, POSTERS_SUBDIR, name);
}

async function posterExists(uploadDirAbs, storageFileName) {
  const p = posterPath(uploadDirAbs, storageFileName);
  if (!p) return false;
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Один кадр ~1 с, масштаб под OG 1200×630. При ошибке ffmpeg — без throw (upload не падает).
 */
async function generatePosterFromVideo(videoPath, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        '1',
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-vf',
        'scale=1200:630:force_original_aspect_ratio=decrease,pad=1200:630:(ow-iw)/2:(oh-ih)/2:color=black',
        '-q:v',
        '3',
        '-y',
        outputPath,
      ],
      { timeout: 120000 }
    );
    return true;
  } catch {
    await fs.unlink(outputPath).catch(() => {});
    return false;
  }
}

async function unlinkPoster(uploadDirAbs, storageFileName) {
  const p = posterPath(uploadDirAbs, storageFileName);
  if (!p) return;
  await fs.unlink(p).catch(() => {});
}

module.exports = {
  POSTERS_SUBDIR,
  posterFileName,
  posterPath,
  posterExists,
  generatePosterFromVideo,
  unlinkPoster,
};
