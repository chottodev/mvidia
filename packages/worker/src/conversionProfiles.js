/**
 * Профили конвертации: один id на сценарий (remux / transcode + кодек/контейнер).
 * Тюнинг — правка CONVERSION_PROFILES или env WORKER_FFMPEG_PROFILE_<ID>='{"crf":"23"}'.
 */

/** @typedef {'remux_copy'|'remux_video_copy'|'transcode'} ConversionMode */

/**
 * @typedef {object} ConversionProfile
 * @property {string} id
 * @property {string} label
 * @property {ConversionMode} mode
 * @property {string} [preset] — libx264 preset (transcode)
 * @property {string} [crf]
 * @property {string|null} [tune]
 * @property {string} [audioBitrate] — AAC для remux_video_copy / transcode
 * @property {number} [maxHeight] — даунскейл если выше (0 = не масштабировать)
 * @property {string|null} [scaleFlags] — flags= для scale, напр. fast_bilinear
 * @property {boolean} [webmInput] — fflags/err_detect для WebM
 * @property {number} [estimateDecodeFactor] — множитель для оценки времени transcode
 * @property {{ type: 'size', minMs: number, msPer200Mb: number }|{ type: 'duration', minMs: number, msPerSec: number }|{ type: 'transcode' }} [estimate]
 */

/** @type {Record<string, ConversionProfile>} */
const CONVERSION_PROFILES = {
  remux_copy: {
    id: 'remux_copy',
    label: 'Remux H.264+AAC без перекодирования',
    mode: 'remux_copy',
    estimate: { type: 'size', minMs: 2000, baseMs: 1500, msPer200Mb: 10000 },
  },

  remux_video_copy: {
    id: 'remux_video_copy',
    label: 'Copy H.264 + перекод аудио в AAC',
    mode: 'remux_video_copy',
    audioBitrate: '128k',
    estimate: { type: 'duration', minMs: 3000, baseMs: 2000, msPerSec: 150 },
  },

  transcode_webm: {
    id: 'transcode_webm',
    label: 'WebM (VP9/VP8) → MP4 H.264',
    mode: 'transcode',
    preset: 'ultrafast',
    crf: '24',
    tune: 'animation',
    audioBitrate: '128k',
    maxHeight: 1080,
    scaleFlags: 'fast_bilinear',
    webmInput: true,
    estimateDecodeFactor: 3.5,
    estimate: { type: 'transcode' },
  },

  transcode_vp9: {
    id: 'transcode_vp9',
    label: 'VP9 (не WebM) → MP4 H.264',
    mode: 'transcode',
    preset: 'veryfast',
    crf: '23',
    tune: 'animation',
    audioBitrate: '128k',
    maxHeight: 1080,
    scaleFlags: 'fast_bilinear',
    webmInput: false,
    estimateDecodeFactor: 3.5,
    estimate: { type: 'transcode' },
  },

  transcode_vp8: {
    id: 'transcode_vp8',
    label: 'VP8 → MP4 H.264',
    mode: 'transcode',
    preset: 'veryfast',
    crf: '23',
    tune: 'animation',
    audioBitrate: '128k',
    maxHeight: 1080,
    scaleFlags: 'fast_bilinear',
    webmInput: false,
    estimateDecodeFactor: 2.0,
    estimate: { type: 'transcode' },
  },

  transcode_hevc: {
    id: 'transcode_hevc',
    label: 'HEVC/H.265 → MP4 H.264',
    mode: 'transcode',
    preset: 'faster',
    crf: '23',
    tune: null,
    audioBitrate: '128k',
    maxHeight: 1080,
    scaleFlags: 'fast_bilinear',
    webmInput: false,
    estimateDecodeFactor: 2.5,
    estimate: { type: 'transcode' },
  },

  transcode_av1: {
    id: 'transcode_av1',
    label: 'AV1 → MP4 H.264',
    mode: 'transcode',
    preset: 'veryfast',
    crf: '24',
    tune: null,
    audioBitrate: '128k',
    maxHeight: 1080,
    scaleFlags: 'fast_bilinear',
    webmInput: false,
    estimateDecodeFactor: 5.0,
    estimate: { type: 'transcode' },
  },

  transcode_h264: {
    id: 'transcode_h264',
    label: 'H.264 перекод (контейнер/аудио)',
    mode: 'transcode',
    preset: 'faster',
    crf: '23',
    tune: null,
    audioBitrate: '128k',
    maxHeight: 1080,
    scaleFlags: 'fast_bilinear',
    webmInput: false,
    estimateDecodeFactor: 1.0,
    estimate: { type: 'transcode' },
  },

  transcode_default: {
    id: 'transcode_default',
    label: 'Прочие кодеки → MP4 H.264',
    mode: 'transcode',
    preset: 'faster',
    crf: '23',
    tune: null,
    audioBitrate: '128k',
    maxHeight: 1080,
    scaleFlags: 'fast_bilinear',
    webmInput: false,
    estimateDecodeFactor: 1.5,
    estimate: { type: 'transcode' },
  },
};

const PRESET_REALTIME_FACTOR = {
  ultrafast: 0.25,
  superfast: 0.35,
  veryfast: 0.5,
  faster: 0.7,
  fast: 0.9,
  medium: 1.2,
  slow: 2.0,
  slower: 3.0,
  veryslow: 5.0,
};

function isWebmSource(sourcePath, summary) {
  return (
    /\.webm$/i.test(sourcePath) ||
    (summary?.format && summary.format.toLowerCase().includes('webm'))
  );
}

function resolveTranscodeProfileId(sourcePath, summary) {
  if (isWebmSource(sourcePath, summary)) return 'transcode_webm';

  const codec = summary?.videoCodec || '';
  if (codec === 'vp9') return 'transcode_vp9';
  if (codec === 'vp8') return 'transcode_vp8';
  if (codec === 'hevc' || codec === 'h265') return 'transcode_hevc';
  if (codec === 'av1') return 'transcode_av1';
  if (codec === 'h264') return 'transcode_h264';
  return 'transcode_default';
}

function applyProfileEnvOverrides(profile) {
  const envKey = `WORKER_FFMPEG_PROFILE_${profile.id.toUpperCase()}`;
  const raw = process.env[envKey];
  if (!raw) return profile;
  try {
    const patch = JSON.parse(raw);
    return { ...profile, ...patch };
  } catch {
    return profile;
  }
}

/**
 * @param {'remux_copy'|'remux_video_copy'|'transcode'} strategy
 * @param {string} sourcePath
 * @param {ReturnType<import('./ffprobe').probeSummary>} summary
 * @returns {ConversionProfile}
 */
function resolveConversionProfile(strategy, sourcePath, summary) {
  let id;
  if (strategy === 'remux_copy') id = 'remux_copy';
  else if (strategy === 'remux_video_copy') id = 'remux_video_copy';
  else id = resolveTranscodeProfileId(sourcePath, summary);

  const base = CONVERSION_PROFILES[id] || CONVERSION_PROFILES.transcode_default;
  let profile = applyProfileEnvOverrides({ ...base });
  if (isWebmSource(sourcePath, summary) && !profile.webmInput) {
    profile = { ...profile, webmInput: true };
  }
  return profile;
}

function presetRealtimeFactor(preset) {
  return PRESET_REALTIME_FACTOR[preset] ?? 1.2;
}

function estimateDurationFromSize(durationSec, sizeBytes) {
  if (durationSec > 0) return { sec: durationSec, fromProbe: true };
  const guess = Math.max(30, sizeBytes / (1.5 * 1024 * 1024));
  return { sec: guess, fromProbe: false };
}

function formatEstimateHuman(ms) {
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `~${sec} с`;
  if (sec < 3600) {
    const m = Math.ceil(sec / 60);
    return m === 1 ? '~1 мин' : `~${m} мин`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.ceil((sec % 3600) / 60);
  if (m === 0) return h === 1 ? '~1 ч' : `~${h} ч`;
  return `~${h} ч ${m} мин`;
}

/**
 * @param {ConversionProfile} profile
 * @param {ReturnType<import('./ffprobe').probeSummary>} summary
 */
function estimateConversionForProfile(profile, summary) {
  const sizeBytes = summary.sizeBytes || 0;
  const { sec: durationSecUsed, fromProbe: durationFromProbe } = estimateDurationFromSize(
    summary.durationSec,
    sizeBytes
  );

  const estimate = profile.estimate || { type: 'transcode' };

  if (estimate.type === 'size') {
    const estimatedMs = Math.round(
      Math.max(
        estimate.minMs,
        estimate.baseMs + (sizeBytes / (200 * 1024 * 1024)) * estimate.msPer200Mb
      )
    );
    return {
      estimatedMs,
      estimateHuman: formatEstimateHuman(estimatedMs),
      profileId: profile.id,
      durationSecUsed,
      durationFromProbe,
    };
  }

  if (estimate.type === 'duration') {
    const estimatedMs = Math.round(
      Math.max(estimate.minMs, estimate.baseMs + durationSecUsed * estimate.msPerSec)
    );
    return {
      estimatedMs,
      estimateHuman: formatEstimateHuman(estimatedMs),
      profileId: profile.id,
      durationSecUsed,
      durationFromProbe,
    };
  }

  const preset = profile.preset || 'faster';
  const height = summary.height || 1080;
  const width = summary.width || 1920;
  const maxH = profile.maxHeight || 1080;
  const outHeight = Math.min(height, maxH);
  const outWidth = Math.max(1, Math.round(width * (outHeight / Math.max(height, 1))));
  const pixelFactor = Math.sqrt(Math.max(0.25, (outWidth * outHeight) / (1920 * 1080)));

  let realtimeFactor = presetRealtimeFactor(preset);
  realtimeFactor *= profile.estimateDecodeFactor ?? 1.5;
  realtimeFactor *= pixelFactor;

  const tune = parseFloat(process.env.WORKER_FFMPEG_ESTIMATE_FACTOR || '1');
  const envFactor = Number.isFinite(tune) && tune > 0 ? tune : 1;
  realtimeFactor *= envFactor;

  const estimatedMs = Math.round(Math.max(5000, durationSecUsed * realtimeFactor * 1000));

  return {
    estimatedMs,
    estimateHuman: formatEstimateHuman(estimatedMs),
    profileId: profile.id,
    durationSecUsed: Math.round(durationSecUsed * 10) / 10,
    durationFromProbe,
    realtimeFactor: Math.round(realtimeFactor * 100) / 100,
    preset,
    crf: profile.crf,
    videoCodec: summary.videoCodec,
  };
}

/** @param {ConversionProfile} profile */
function videoFilterArgs(summary, profile) {
  const maxH = profile.maxHeight || 0;
  const h = summary.height || 0;
  if (maxH > 0 && h > maxH) {
    const flags = profile.scaleFlags ? `:${profile.scaleFlags}` : '';
    return ['-vf', `scale=-2:${maxH}${flags}`, '-filter_threads', '0'];
  }
  return [];
}

/** @param {ConversionProfile} profile */
function inputOptionsForProfile(profile) {
  if (!profile.webmInput) return [];
  return [
    '-fflags',
    '+genpts+discardcorrupt',
    '-err_detect',
    'ignore_err',
    '-thread_queue_size',
    '512',
  ];
}

module.exports = {
  CONVERSION_PROFILES,
  resolveConversionProfile,
  estimateConversionForProfile,
  videoFilterArgs,
  inputOptionsForProfile,
  isWebmSource,
  presetRealtimeFactor,
};
