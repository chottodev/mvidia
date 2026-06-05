const path = require('path');
const fs = require('fs/promises');
const { spawn } = require('child_process');
const { probeMedia, remuxStrategy, hasAudioStream, probeSummary } = require('./ffprobe');
const {
  resolveConversionProfile,
  estimateConversionForProfile,
  videoFilterArgs,
  inputOptionsForProfile,
} = require('./conversionProfiles');
const { isTranscodeCancelled } = require('./transcodeCancel');
const { createLogger } = require('db');

const log = createLogger('transcode');
const CANCEL_MESSAGE = 'Отменено администратором';

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

function ffmpegHeartbeatMs() {
  const raw = process.env.WORKER_FFMPEG_HEARTBEAT_MS;
  if (raw === undefined || raw === '') return 60000;
  const ms = parseInt(raw, 10);
  if (Number.isNaN(ms) || ms <= 0) return 0;
  return ms;
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
  const heartbeatMs = ffmpegHeartbeatMs();

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
    let heartbeatTimer;
    let abortPending = false;
    const checkAbort = () => {
      if (!context.jobId || settled || abortPending) return;
      abortPending = true;
      isTranscodeCancelled(context.jobId)
        .then((cancelled) => {
          abortPending = false;
          if (cancelled && !settled) {
            proc.kill('SIGKILL');
            finish(new Error(CANCEL_MESSAGE));
          }
        })
        .catch(() => {
          abortPending = false;
        });
    };

    checkAbort();
    const startedAt = Date.now();

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearInterval(stallTimer);
      clearInterval(heartbeatTimer);
      if (err) reject(err);
      else resolve();
    };

    const heartbeatFields = () => {
      const elapsedMs = Date.now() - startedAt;
      const outTimeSec = lastOutTimeUs >= 0 ? lastOutTimeUs / 1_000_000 : null;
      const fields = {
        ...context,
        elapsedMs,
        outTimeSec,
      };
      const srcDur = context.sourceDurationSec;
      if (srcDur > 0 && outTimeSec != null) {
        fields.percent = Math.min(100, Math.round((outTimeSec / srcDur) * 100));
      }
      return fields;
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
                'Возможен битый WebM или VP9 на слабом CPU — проверьте исходник ffprobe-om'
            )
          );
        } else {
          checkAbort();
        }
      }, 30000);
    }

    if (heartbeatMs > 0) {
      heartbeatTimer = setInterval(() => {
        checkAbort();
        log.info('ffmpeg: конвертация продолжается', heartbeatFields());
      }, heartbeatMs);
    }
  });
}

function remuxCopyArgs(sourcePath, outputPath, summary, profile) {
  return [
    ...inputOptionsForProfile(profile),
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

function remuxVideoCopyArgs(sourcePath, outputPath, summary, profile) {
  const audioBitrate = profile.audioBitrate || '128k';
  const args = [
    ...inputOptionsForProfile(profile),
    '-i',
    sourcePath,
    ...durationLimitArgs(summary),
    '-map',
    '0:v:0',
    '-c:v',
    'copy',
  ];
  if (summary.hasAudio) {
    args.push('-map', '0:a:0', '-c:a', 'aac', '-b:a', audioBitrate);
  } else {
    args.push('-an');
  }
  args.push('-movflags', '+faststart', '-y', outputPath);
  return args;
}

function transcodeToDeliveryArgs(sourcePath, outputPath, summary, probe, profile) {
  const hasAudio = hasAudioStream(probe);
  const audioBitrate = profile.audioBitrate || '128k';
  const args = [
    '-threads',
    '0',
    ...inputOptionsForProfile(profile),
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
    profile.preset || 'faster',
    '-crf',
    profile.crf || '23',
    '-threads',
    '0'
  );
  args.push(...videoFilterArgs(summary, profile));
  args.push('-pix_fmt', 'yuv420p');
  if (profile.tune) {
    args.push('-tune', profile.tune);
  }
  if (hasAudio) {
    args.push('-c:a', 'aac', '-b:a', audioBitrate);
  }
  args.push('-movflags', '+faststart', '-y', outputPath);
  return args;
}

function ffmpegContext(profile, extra) {
  return {
    profileId: profile.id,
    profileLabel: profile.label,
    ...extra,
  };
}

async function remuxCopy(sourcePath, outputPath, summary, profile, jobId) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg(remuxCopyArgs(sourcePath, outputPath, summary, profile), ffmpegContext(profile, {
    mode: 'remux',
    sourcePath,
    outputPath,
    sourceDurationSec: summary.durationSec,
    jobId,
  }));
}

async function remuxVideoCopy(sourcePath, outputPath, summary, profile, jobId) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg(remuxVideoCopyArgs(sourcePath, outputPath, summary, profile), ffmpegContext(profile, {
    mode: 'remux_video',
    sourcePath,
    outputPath,
    sourceDurationSec: summary.durationSec,
    jobId,
  }));
}

async function transcodeToDelivery(sourcePath, outputPath, summary, probe, profile, jobId) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg(transcodeToDeliveryArgs(sourcePath, outputPath, summary, probe, profile), ffmpegContext(profile, {
    mode: 'transcode',
    sourcePath,
    outputPath,
    sourceDurationSec: summary.durationSec,
    hasAudio: hasAudioStream(probe),
    preset: profile.preset,
    crf: profile.crf,
    tune: profile.tune,
    jobId,
  }));
}

/**
 * @returns {Promise<{ usedCopy: boolean, strategy: string, profileId: string, sourceSizeBytes: number, videoDurationSec: number|null, videoCodec: string|null, width: number|null, height: number|null }>}
 */
async function produceDeliveryMp4(sourcePath, outputPath, options = {}) {
  const jobId = options.jobId || null;
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
  const profile = resolveConversionProfile(strategy, sourcePath, summary);
  const estimate = estimateConversionForProfile(profile, summary);

  log.info('ffmpeg: профиль', {
    strategy,
    profileId: profile.id,
    profileLabel: profile.label,
    outputPath,
    preset: profile.preset || null,
    crf: profile.crf || null,
    tune: profile.tune || null,
  });
  log.info('ffmpeg: оценка времени конвертации', {
    sourcePath,
    outputPath,
    strategy,
    ...estimate,
  });

  if (strategy === 'remux_copy') {
    await remuxCopy(sourcePath, outputPath, summary, profile, jobId);
    return buildResult(true, strategy, profile.id, summary);
  }
  if (strategy === 'remux_video_copy') {
    await remuxVideoCopy(sourcePath, outputPath, summary, profile, jobId);
    return buildResult(true, strategy, profile.id, summary);
  }

  log.info('ffmpeg: полная конвертация', { sourcePath, outputPath, profileId: profile.id });
  await transcodeToDelivery(sourcePath, outputPath, summary, probe, profile, jobId);
  return buildResult(false, strategy, profile.id, summary);
}

function buildResult(usedCopy, strategy, profileId, summary) {
  return {
    usedCopy,
    strategy,
    profileId,
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
