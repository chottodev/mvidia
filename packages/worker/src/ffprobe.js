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
      'format=format_name,duration,size:stream=codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate',
      '-of',
      'json',
      filePath,
    ],
    { timeout: 120000, maxBuffer: 4 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

function hasAudioStream(probe) {
  return (probe.streams || []).some((s) => s.codec_type === 'audio');
}

function probeSummary(probe) {
  const streams = probe.streams || [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');
  const durationSec = parseFloat(probe.format?.duration || '0') || 0;
  const sizeBytes = parseInt(probe.format?.size || '0', 10) || 0;
  return {
    format: probe.format?.format_name || '',
    durationSec,
    sizeBytes,
    videoCodec: video?.codec_name || null,
    audioCodec: audio?.codec_name || null,
    width: video?.width || null,
    height: video?.height || null,
    hasAudio: !!audio,
  };
}

/** h264 → mp4 без перекодирования видео (контейнер webm/mkv/mp4). */
function remuxStrategy(probe) {
  const summary = probeSummary(probe);
  if (summary.videoCodec !== 'h264') return 'transcode';
  if (!summary.hasAudio) return 'remux_copy';
  if (summary.audioCodec === 'aac') return 'remux_copy';
  if (summary.audioCodec === 'opus' || summary.audioCodec === 'vorbis') {
    return 'remux_video_copy';
  }
  return 'transcode';
}

/** @deprecated use remuxStrategy */
function canRemuxToMp4(probe) {
  return remuxStrategy(probe) === 'remux_copy';
}

module.exports = { probeMedia, canRemuxToMp4, remuxStrategy, hasAudioStream, probeSummary };
