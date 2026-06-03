const { Queue } = require('bullmq');
const { PROCESSING_STEP, Video, createLogger } = require('db');

const log = createLogger('queue');
const QUEUE_NAME = 'video-transcode';

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
    queue = new Queue(QUEUE_NAME, { connection });
  }
  return queue;
}

async function enqueueTranscode(publicId) {
  log.info('постановка задачи в очередь', { publicId, queue: QUEUE_NAME });
  const q = getTranscodeQueue();
  const job = await q.add(
    'transcode',
    { publicId },
    {
      jobId: publicId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  );
  await Video.updateOne(
    { publicId },
    { $set: { processingStep: PROCESSING_STEP.QUEUED } }
  );
  log.info('задача в очереди', {
    publicId,
    jobId: job.id,
    processingStep: PROCESSING_STEP.QUEUED,
  });
}

module.exports = { QUEUE_NAME, enqueueTranscode, getTranscodeQueue };
