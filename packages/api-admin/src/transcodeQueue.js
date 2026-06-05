const { Queue } = require('bullmq');
const Redis = require('ioredis');
const {
  Video,
  ConversionLog,
  CONVERSION_LOG_STATUS,
  VIDEO_STATUS,
  TRANSCODE_QUEUE_NAME,
  transcodeCancelRedisKey,
} = require('db');

const CANCEL_MESSAGE = 'Отменено администратором';

let queue;

function redisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  return { url };
}

function getTranscodeQueue() {
  if (!queue) {
    const connection = redisConnection();
    if (!connection) {
      throw new Error('REDIS_URL не задан');
    }
    queue = new Queue(TRANSCODE_QUEUE_NAME, { connection });
  }
  return queue;
}

async function setTranscodeCancelFlag(jobId) {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL не задан');
  const redis = new Redis(url, { maxRetriesPerRequest: null });
  try {
    await redis.set(transcodeCancelRedisKey(jobId), '1', 'EX', 86400);
  } finally {
    redis.disconnect();
  }
}

async function markVideoAndLogCancelled(jobId, publicId, workDurationMs) {
  if (publicId) {
    await Video.updateOne(
      { publicId },
      {
        $set: {
          status: VIDEO_STATUS.FAILED,
          errorMessage: CANCEL_MESSAGE,
          processingStep: undefined,
        },
      }
    );
  }

  const logPatch = {
    status: CONVERSION_LOG_STATUS.CANCELLED,
    errorMessage: CANCEL_MESSAGE,
    finishedAt: new Date(),
  };
  if (workDurationMs != null) logPatch.workDurationMs = workDurationMs;

  await ConversionLog.updateMany(
    { jobId, status: CONVERSION_LOG_STATUS.RUNNING },
    { $set: logPatch }
  );
}

/**
 * @returns {Promise<{ cancelled: boolean, message?: string, publicId?: string, jobState?: string }>}
 */
async function cancelTranscodeJob(jobId) {
  const connection = redisConnection();
  if (!connection) {
    return { cancelled: false, message: 'REDIS_URL не задан' };
  }

  const q = getTranscodeQueue();
  const job = await q.getJob(jobId);
  if (!job) {
    const log = await ConversionLog.findOne({ jobId }).sort({ createdAt: -1 }).lean();
    if (log && log.status === CONVERSION_LOG_STATUS.RUNNING) {
      const workDurationMs = Date.now() - new Date(log.createdAt).getTime();
      await setTranscodeCancelFlag(jobId);
      await markVideoAndLogCancelled(jobId, log.publicId, workDurationMs);
      return { cancelled: true, publicId: log.publicId, jobState: 'unknown' };
    }
    return { cancelled: false, message: 'Задача не найдена в очереди' };
  }

  const state = await job.getState();
  const publicId = job.data?.publicId;

  if (state === 'completed') {
    return { cancelled: false, message: 'Задача уже завершена' };
  }

  await setTranscodeCancelFlag(jobId);

  if (state === 'waiting' || state === 'delayed' || state === 'paused') {
    await job.remove();
    await markVideoAndLogCancelled(jobId, publicId, 0);
    return { cancelled: true, publicId, jobState: state };
  }

  if (state === 'active') {
    try {
      await job.remove({ ignoreLock: true });
    } catch {
      /* воркер ещё держит lock — флаг cancel остановит ffmpeg */
    }
    const log = await ConversionLog.findOne({ jobId, status: CONVERSION_LOG_STATUS.RUNNING }).lean();
    const workDurationMs = log ? Date.now() - new Date(log.createdAt).getTime() : null;
    await markVideoAndLogCancelled(jobId, publicId, workDurationMs);
    return { cancelled: true, publicId, jobState: state };
  }

  if (state === 'failed') {
    await markVideoAndLogCancelled(jobId, publicId, null);
    return { cancelled: true, publicId, jobState: state };
  }

  return { cancelled: false, message: `Неподдерживаемый статус задачи: ${state}` };
}

module.exports = { cancelTranscodeJob, TRANSCODE_QUEUE_NAME };
