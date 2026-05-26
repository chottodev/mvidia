const path = require('path');
const fs = require('fs/promises');
const { spawn, execSync } = require('child_process');

const MERGE_FPS = Math.min(60, Math.max(1, parseInt(process.env.MERGE_FPS || '30', 10) || 30));
const MERGE_MAX_WIDTH = Math.max(
  640,
  parseInt(process.env.MERGE_MAX_WIDTH || '1920', 10) || 1920
);
const MERGE_CRF = process.env.MERGE_CRF || '23';
const MERGE_X264_PRESET = process.env.MERGE_X264_PRESET || 'veryfast';

let cachedVideoEncoder = null;

function pickVideoEncoder() {
  if (cachedVideoEncoder) return cachedVideoEncoder;
  const forced = process.env.MERGE_VIDEO_ENCODER;
  if (forced === 'libx264' || forced === 'h264_nvenc') {
    cachedVideoEncoder = forced;
    return cachedVideoEncoder;
  }
  try {
    const encoders = execSync('ffmpeg -hide_banner -encoders 2>/dev/null', {
      encoding: 'utf8',
    });
    cachedVideoEncoder = /h264_nvenc/.test(encoders) ? 'h264_nvenc' : 'libx264';
  } catch {
    cachedVideoEncoder = 'libx264';
  }
  return cachedVideoEncoder;
}

const TRACK_FILES = {
  screen: 'screen.webm',
  camera: 'camera.webm',
  microphone: 'microphone.webm',
  'system-audio': 'system-audio.webm',
};

function runProcess(bin, args, timeoutMs = 30 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`${bin} timeout`));
    }, timeoutMs);
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stderr);
      else {
        const tail = stderr.trim().split('\n').slice(-12).join('\n');
        reject(new Error(`${bin} exit ${code}: ${tail}`));
      }
    });
  });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isReadableMedia(filePath) {
  try {
    await runProcess('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=format_name',
      '-of',
      'csv=p=0',
      filePath,
    ]);
    return true;
  } catch {
    return false;
  }
}

function readMeta(meta) {
  const tracks = meta?.tracks || {};
  const layout = meta?.layout?.pip || {};
  return {
    tracks,
    widthRatio: layout.widthRatio ?? 0.44,
    marginPx: layout.marginPx ?? 16,
  };
}

function offsetSec(meta, trackId) {
  const { tracks } = readMeta(meta);
  const perfValues = Object.entries(tracks)
    .filter(([, t]) => t && t.enabled !== false && typeof t.startedAtPerf === 'number')
    .map(([, t]) => t.startedAtPerf);
  if (!perfValues.length) return 0;
  const base = Math.min(...perfValues);
  const t = tracks[trackId];
  if (!t || typeof t.startedAtPerf !== 'number') return 0;
  return Math.max(0, (t.startedAtPerf - base) / 1000);
}

async function discoverInputs(stagingDir, meta) {
  const inputs = [];
  for (const [trackId, fileName] of Object.entries(TRACK_FILES)) {
    const full = path.join(stagingDir, fileName);
    if (!(await fileExists(full))) continue;
    const st = await fs.stat(full);
    if (st.size === 0) continue;
    if (!(await isReadableMedia(full))) {
      // eslint-disable-next-line no-console
      console.warn('[recording] merge skip corrupt track', trackId, full);
      continue;
    }
    inputs.push({
      trackId,
      path: full,
      offset: offsetSec(meta, trackId),
    });
  }
  return inputs;
}

function normalizeVideoChain(inputLabel, outputLabel, extraFilters = '') {
  const mid = extraFilters ? `,${extraFilters}` : '';
  return `[${inputLabel}]setpts=PTS-STARTPTS,scale='min(${MERGE_MAX_WIDTH},iw)':-2:flags=fast_bilinear,fps=${MERGE_FPS}${mid}[${outputLabel}]`;
}

function normalizeAudioChain(inputLabel, outputLabel) {
  return `[${inputLabel}:a]asetpts=PTS-STARTPTS,aresample=48000[${outputLabel}]`;
}

function appendVideoEncoderArgs(args) {
  const encoder = pickVideoEncoder();
  const gop = MERGE_FPS * 2;
  if (encoder === 'h264_nvenc') {
    args.push(
      '-c:v',
      'h264_nvenc',
      '-preset',
      'fast',
      '-rc',
      'vbr',
      '-cq',
      MERGE_CRF,
      '-b:v',
      '0',
      '-g',
      String(gop)
    );
  } else {
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      MERGE_X264_PRESET,
      '-crf',
      MERGE_CRF,
      '-threads',
      '0',
      '-g',
      String(gop),
      '-keyint_min',
      String(MERGE_FPS)
    );
  }
  args.push('-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-shortest');
}

function buildFfmpegArgs(inputs, outputPath, meta) {
  const { widthRatio, marginPx } = readMeta(meta);
  const screen = inputs.find((i) => i.trackId === 'screen');
  if (!screen) throw new Error('SCREEN_TRACK_REQUIRED');

  const camera = inputs.find((i) => i.trackId === 'camera');
  const mic = inputs.find((i) => i.trackId === 'microphone');
  const sysAudio = inputs.find((i) => i.trackId === 'system-audio');

  const args = ['-y', '-fflags', '+genpts+igndts'];
  const indexed = [];
  let n = 0;

  const pushIn = (inp) => {
    if (inp.offset > 0.001) args.push('-itsoffset', String(inp.offset));
    args.push('-i', inp.path);
    indexed.push({ ...inp, n });
    n += 1;
  };

  pushIn(screen);
  if (camera) pushIn(camera);
  const audioOnly = [];
  if (mic) {
    pushIn(mic);
    audioOnly.push(indexed[indexed.length - 1]);
  }
  if (sysAudio) {
    pushIn(sysAudio);
    audioOnly.push(indexed[indexed.length - 1]);
  }

  const sIdx = indexed.find((i) => i.trackId === 'screen').n;
  const cIdx = camera ? indexed.find((i) => i.trackId === 'camera').n : null;

  const fc = [];
  if (cIdx != null) {
    fc.push(normalizeVideoChain(`${sIdx}:v`, 'sv'));
    fc.push(`[${cIdx}:v]setpts=PTS-STARTPTS,fps=${MERGE_FPS}[cv]`);
    fc.push(`[cv]scale=iw*${widthRatio}:-2[pip]`);
    fc.push(`[sv][pip]overlay=W-w-${marginPx}:H-h-${marginPx}:shortest=1[vout]`);
  } else {
    fc.push(normalizeVideoChain(`${sIdx}:v`, 'vout'));
  }

  let audioMapFilter = null;
  let audioMapDirect = null;
  if (audioOnly.length === 1) {
    const a = audioOnly[0];
    fc.push(normalizeAudioChain(`${a.n}`, 'aout'));
    audioMapFilter = '[aout]';
  } else if (audioOnly.length > 1) {
    audioOnly.forEach((t, i) => {
      fc.push(normalizeAudioChain(`${t.n}`, `a${i}`));
    });
    const labels = audioOnly.map((_, i) => `[a${i}]`).join('');
    fc.push(
      `${labels}amix=inputs=${audioOnly.length}:duration=longest:dropout_transition=2[aout]`
    );
    audioMapFilter = '[aout]';
  }

  const videoMapFilter = '[vout]';

  args.push('-filter_complex', fc.join(';'));
  args.push('-map', videoMapFilter);

  if (audioMapFilter) {
    args.push('-map', audioMapFilter);
    args.push('-c:a', 'aac', '-b:a', '128k');
  } else {
    args.push('-map', `${sIdx}:a?`);
    args.push('-c:a', 'aac', '-b:a', '128k');
  }

  appendVideoEncoderArgs(args);
  args.push(outputPath);

  return args;
}

async function mergeScreencast({ stagingDir, meta, outputPath }) {
  let metaObj = meta;
  if (!metaObj) {
    try {
      const raw = await fs.readFile(path.join(stagingDir, 'meta.json'), 'utf8');
      metaObj = JSON.parse(raw);
    } catch {
      metaObj = {};
    }
  }

  const inputs = await discoverInputs(stagingDir, metaObj);
  if (!inputs.some((i) => i.trackId === 'screen')) {
    throw new Error('SCREEN_TRACK_REQUIRED');
  }

  const args = buildFfmpegArgs(inputs, outputPath, metaObj);
  // eslint-disable-next-line no-console
  console.log(
    '[recording] ffmpeg',
    pickVideoEncoder(),
    `fps=${MERGE_FPS}`,
    `maxW=${MERGE_MAX_WIDTH}`,
    args.join(' ')
  );
  await runProcess('ffmpeg', args);
}

module.exports = {
  mergeScreencast,
  TRACK_FILES,
};
