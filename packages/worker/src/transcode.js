const fs = require('fs/promises');
const fsc = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { probeMedia, canRemuxToMp4 } = require('./ffprobe');
const { createLogger } = require('db');

const log = createLogger('transcode');
const execFileAsync = promisify(execFile);

async function remuxCopy(sourcePath, outputPath) {
  await fs.mkdir(require('path').dirname(outputPath), { recursive: true });
  await execFileAsync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      sourcePath,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      '-y',
      outputPath,
    ],
    { timeout: 3600000 }
  );
}

async function transcodeToDelivery(sourcePath, outputPath) {
  await fs.mkdir(require('path').dirname(outputPath), { recursive: true });
  await execFileAsync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      sourcePath,
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '23',
      '-vf',
      'scale=-2:1080',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      '-y',
      outputPath,
    ],
    { timeout: 3600000 }
  );
}

/**
 * @returns {Promise<{ outputPath: string, usedCopy: boolean }>}
 */
async function produceDeliveryMp4(sourcePath, outputPath) {
  log.info('ffmpeg: анализ исходника', { sourcePath });
  const probe = await probeMedia(sourcePath);
  const fastPath = canRemuxToMp4(probe);
  log.info('ffmpeg: режим', { fastPath, outputPath });
  if (fastPath) {
    await remuxCopy(sourcePath, outputPath);
    return { outputPath, usedCopy: true };
  }
  log.info('ffmpeg: полная конвертация', { sourcePath, outputPath });
  await transcodeToDelivery(sourcePath, outputPath);
  return { outputPath, usedCopy: false };
}

async function deliveryFileSize(outputPath) {
  const stat = await fs.stat(outputPath);
  return stat.size;
}

module.exports = { produceDeliveryMp4, deliveryFileSize };
