const fs = require('fs/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

async function generatePosterFromVideo(videoPath, outputPath) {
  await fs.mkdir(require('path').dirname(outputPath), { recursive: true });
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

module.exports = { generatePosterFromVideo };
