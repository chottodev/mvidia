const path = require('path');
const fs = require('fs/promises');
const { spawn } = require('child_process');

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
    widthRatio: layout.widthRatio ?? 0.22,
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

function buildFfmpegArgs(inputs, outputPath, meta) {
  const { widthRatio, marginPx } = readMeta(meta);
  const screen = inputs.find((i) => i.trackId === 'screen');
  if (!screen) throw new Error('SCREEN_TRACK_REQUIRED');

  const camera = inputs.find((i) => i.trackId === 'camera');
  const mic = inputs.find((i) => i.trackId === 'microphone');
  const sysAudio = inputs.find((i) => i.trackId === 'system-audio');

  const args = ['-y'];
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
    fc.push(`[${cIdx}:v]scale=iw*${widthRatio}:-2[pip]`);
    fc.push(`[${sIdx}:v][pip]overlay=W-w-${marginPx}:H-h-${marginPx}:shortest=1[vout]`);
  }

  let audioMapFilter = null;
  let audioMapDirect = null;
  if (audioOnly.length === 1) {
    audioMapDirect = `${audioOnly[0].n}:a`;
  } else if (audioOnly.length > 1) {
    const labels = audioOnly.map((t) => `[${t.n}:a]`).join('');
    fc.push(`${labels}amix=inputs=${audioOnly.length}:duration=longest:dropout_transition=0[aout]`);
    audioMapFilter = '[aout]';
  }

  const videoMapFilter = cIdx != null ? '[vout]' : null;
  const videoMapDirect = `${sIdx}:v`;

  if (fc.length) {
    args.push('-filter_complex', fc.join(';'));
  }

  if (videoMapFilter) {
    args.push('-map', videoMapFilter);
  } else {
    args.push('-map', videoMapDirect);
  }

  if (audioMapFilter) {
    args.push('-map', audioMapFilter);
    args.push('-c:a', 'aac', '-b:a', '128k');
  } else if (audioMapDirect) {
    args.push('-map', audioMapDirect);
    args.push('-c:a', 'aac', '-b:a', '128k');
  } else {
    args.push('-map', `${sIdx}:a?`);
    args.push('-c:a', 'aac', '-b:a', '128k');
  }

  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-shortest',
    outputPath
  );

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
  console.log('[recording] ffmpeg', args.join(' '));
  await runProcess('ffmpeg', args);
}

module.exports = {
  mergeScreencast,
  TRACK_FILES,
};
