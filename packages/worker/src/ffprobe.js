const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

async function probeMedia(filePath) {
  const { stdout } = await execFileAsync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=format_name:stream=codec_name,codec_type',
      '-of',
      'json',
      filePath,
    ],
    { timeout: 120000, maxBuffer: 4 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

function canRemuxToMp4(probe) {
  const streams = probe.streams || [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');
  if (!video || video.codec_name !== 'h264') return false;
  const format = (probe.format && probe.format.format_name) || '';
  if (!format.includes('mp4') && !format.includes('mov')) return false;
  if (!audio) return true;
  return audio.codec_name === 'aac';
}

module.exports = { probeMedia, canRemuxToMp4 };
