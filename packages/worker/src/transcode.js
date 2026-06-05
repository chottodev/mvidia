const path = require('path');
const fs = require('fs/promises');
const { spawn } = require('child_process');
const { probeMedia, remuxStrategy, hasAudioStream, probeSummary } = require('./ffprobe');
const { createLogger } = require('db');

const log = createLogger('transcode');

function ffmpegTimeoutMs() {
  const raw = process.env.WORKER_FFMPEG_TIMEOUT_MS;
  if (raw === undefined || raw === '') return 0;
  const ms = parseInt(raw, 10);
  if (Number.isNaN(ms) || ms <= 0) return 0;
  return ms;
}

function ffmpegStallMs() {
  const raw = process.env.WORKER_FFMPEG_STALL_MS;
  if (raw === undefined || raw === '') return 300000;
  const ms = parseInt(raw, 10);
  if (Number.isNaN(ms) || ms <= 0) return 0;
  return ms;
}

function ffmpegPreset() {
  return process.env.WORKER_FFMPEG_PRESET || 'medium';
}

function ffmpegCrf() {
  return process.env.WORKER_FFMPEG_CRF || '23';
}

function isWebmSource(sourcePath, summary) {
  return (
    /\.webm$/i.test(sourcePath) ||
    (summary.format && summary.format.toLowerCase().includes('webm'))
  );
}

function inputOptions(sourcePath, summary) {
  const opts = [];
  if (isWebmSource(sourcePath, summary)) {
    // Битые/недописанные WebM от MediaRecorder: не зависать на мусорных таймстемпах.
    opts.push('-fflags', '+genpts+discardcorrupt', '-err_detect', 'ignore_err');
  }
  return opts;
}

function durationLimitArgs(summary) {
  if (summary.durationSec > 0 && summary.durationSec < 86400) {
    return ['-t', String(Math.ceil(summary.durationSec + 1))];
  }
  return [];
}

function runFfmpeg(args, context) {
  const timeoutMs = ffmpegTimeoutMs();
  const stallMs = ffmpegStallMs();

  return new Promise((resolve, reject) => {
    const procArgs = ['-hide_banner', '-nostats', '-progress', 'pipe:1', ...args];
    const proc = spawn('ffmpeg', procArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    let stdoutBuf = '';
    let lastOutTimeUs = -1;
    let lastProgressAt = Date.now();
    let settled = false;
    let timeoutTimer;
    let stallTimer;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearInterval(stallTimer);
      if (err) reject(err);
      else resolve();
    };

    const onProgressLine = (line) => {
      if (line.startsWith('out_time_us=')) {
        const us = parseInt(line.slice('out_time_us='.length), 10);
        if (!Number.isNaN(us) && us > lastOutTimeUs) {
          lastOutTimeUs = us;
          lastProgressAt = Date.now();
        }
      } else if (line === 'progress=end') {
        lastProgressAt = Date.now();
      }
    };

    proc.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() || '';
      for (const line of lines) {
        onProgressLine(line.trim());
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 16 * 1024 * 1024) {
        stderr = stderr.slice(-8 * 1024 * 1024);
      }
    });

    proc.on('error', (e) => finish(e));

    proc.on('close', (code, signal) => {
      if (code === 0) {
        finish();
        return;
      }
      const tail = stderr.trim().split('\n').slice(-5).join(' ');
      log.error('ffmpeg: сбой', {
        ...context,
        exitCode: code,
        signal,
        stderr: stderr.trim().slice(-4000),
      });
      finish(new Error(tail || `ffmpeg завершился с кодом ${code}`));
    });

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        proc.kill('SIGKILL');
        log.error('ffmpeg: таймаут', { ...context, timeoutMs });
        finish(
          new Error(
            `Превышен общий лимит конвертации (${Math.round(timeoutMs / 60000)} мин)`
          )
        );
      }, timeoutMs);
    }

    if (stallMs > 0) {
      stallTimer = setInterval(() => {
        const idleMs = Date.now() - lastProgressAt;
        if (idleMs >= stallMs) {
          proc.kill('SIGKILL');
          log.error('ffmpeg: зависание', {
            ...context,
            stallMs,
            idleMs,
            lastOutTimeUs,
          });
          finish(
            new Error(
              `ffmpeg завис (нет прогресса ${Math.round(idleMs / 60000)} мин). ` +
                'Возможен битый WebM или VP9 на слабом CPU — проверьте исходник ffprobe-ом'
            )
          );
        }
      }, 30000);
    }
  });
}

function remuxCopyArgs(sourcePath, outputPath, summary) {
  return [
    ...inputOptions(sourcePath, summary),
    '-i',
    sourcePath,
    ...durationLimitArgs(summary),
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    '-y',
    outputPath,
  ];
}

function remuxVideoCopyArgs(sourcePath, outputPath, summary) {
  const args = [
    ...inputOptions(sourcePath, summary),
    '-i',
    sourcePath,
    ...durationLimitArgs(summary),
    '-map',
    '0:v:0',
    '-c:v',
    'copy',
  ];
  if (summary.hasAudio) {
    args.push('-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k');
  } else {
    args.push('-an');
  }
  args.push('-movflags', '+faststart', '-y', outputPath);
  return args;
}

function transcodeToDeliveryArgs(sourcePath, outputPath, summary, probe) {
  const hasAudio = hasAudioStream(probe);
  const args = [
    ...inputOptions(sourcePath, summary),
    '-i',
    sourcePath,
    ...durationLimitArgs(summary),
    '-map',
    '0:v:0',
  ];
  if (hasAudio) {
    args.push('-map', '0:a:0');
  } else {
    args.push('-an');
  }
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    ffmpegPreset(),
    '-crf',
    ffmpegCrf(),
    '-threads',
    '0',
    '-vf',
    'scale=-2:1080',
    '-pix_fmt',
    'yuv420p'
  );
  if (hasAudio) {
    args.push('-c:a', 'aac', '-b:a', '128k');
  }
  args.push('-movflags', '+faststart', '-y', outputPath);
  return args;
}

async function remuxCopy(sourcePath, outputPath, summary) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg(remuxCopyArgs(sourcePath, outputPath, summary), {
    mode: 'remux',
    sourcePath,
    outputPath,
  });
}

async function remuxVideoCopy(sourcePath, outputPath, summary) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg(remuxVideoCopyArgs(sourcePath, outputPath, summary), {
    mode: 'remux_video',
    sourcePath,
    outputPath,
  });
}

async function transcodeToDelivery(sourcePath, outputPath, summary, probe) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg(transcodeToDeliveryArgs(sourcePath, outputPath, summary, probe), {
    mode: 'transcode',
    sourcePath,
    outputPath,
    hasAudio: hasAudioStream(probe),
    preset: ffmpegPreset(),
  });
}

/**
 * @returns {Promise<{ usedCopy: boolean, strategy: string, sourceSizeBytes: number, videoDurationSec: number|null, videoCodec: string|null, width: number|null, height: number|null }>}
 */
async function produceDeliveryMp4(sourcePath, outputPath) {
  log.info('ffmpeg: анализ исходника', { sourcePath });
  const [probe, stat] = await Promise.all([probeMedia(sourcePath), fs.stat(sourcePath)]);
  const summary = probeSummary(probe);
  summary.sizeBytes = summary.sizeBytes || stat.size;

  log.info('ffmpeg: исходник', {
    sourcePath,
    sourceSizeBytes: stat.size,
    ...summary,
  });

  const strategy = remuxStrategy(probe);
  log.info('ffmpeg: режим', { strategy, outputPath, preset: ffmpegPreset() });

  if (strategy === 'remux_copy') {
    await remuxCopy(sourcePath, outputPath, summary);
    return buildResult(true, strategy, summary);
  }
  if (strategy === 'remux_video_copy') {
    await remuxVideoCopy(sourcePath, outputPath, summary);
    return buildResult(true, strategy, summary);
  }

  log.info('ffmpeg: полная конвертация', { sourcePath, outputPath });
  await transcodeToDelivery(sourcePath, outputPath, summary, probe);
  return buildResult(false, strategy, summary);
}

function buildResult(usedCopy, strategy, summary) {
  return {
    usedCopy,
    strategy,
    sourceSizeBytes: summary.sizeBytes || 0,
    videoDurationSec: summary.durationSec > 0 ? summary.durationSec : null,
    videoCodec: summary.videoCodec,
    width: summary.width,
    height: summary.height,
  };
}

async function deliveryFileSize(outputPath) {
  const stat = await fs.stat(outputPath);
  return stat.size;
}

module.exports = { produceDeliveryMp4, deliveryFileSize };
