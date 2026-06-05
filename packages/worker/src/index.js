const path = require('path');
const fs = require('fs/promises');
const { Worker } = require('bullmq');
const {
  connect,
  migrateVideosWithoutStatus,
  videoPaths,
  createLogger,
  refreshLogLevel,
} = require('db');
const { processTranscodeJob } = require('./processTranscodeJob');

const log = createLogger('worker');
const QUEUE_NAME = 'video-transcode';

function redisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL не задан');
  }
  return { url };
}

async function main() {
  const rootDir = path.join(__dirname, '../../..');
  require('dotenv').config({ path: path.join(rootDir, '.env') });
  require('dotenv').config();
  refreshLogLevel();

  log.info('воркер: запуск', {
    queue: QUEUE_NAME,
    logLevel: process.env.MVIDIA_LOG_LEVEL || 'info',
  });

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mvidia';
  await connect(mongoUri);
  await migrateVideosWithoutStatus();
  log.info('воркер: MongoDB подключена');

  const uploadDirAbs = path.resolve(
    rootDir,
    (process.env.UPLOAD_DIR || 'uploads').replace(/^\.\//, '')
  );
  await fs.mkdir(uploadDirAbs, { recursive: true });
  await fs.mkdir(path.join(uploadDirAbs, videoPaths.SOURCES_SUBDIR), { recursive: true });
  await fs.mkdir(path.join(uploadDirAbs, videoPaths.POSTERS_SUBDIR), { recursive: true });
  log.info('воркер: каталоги uploads готовы', { uploadDirAbs });

  const concurrency = Math.max(1, parseInt(process.env.WORKER_CONCURRENCY || '1', 10));

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { publicId } = job.data;
      if (!publicId) throw new Error('job без publicId');

      log.info('воркер: job active', {
        publicId,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
      });

      return processTranscodeJob(publicId, uploadDirAbs, {
        jobId: job.id != null ? String(job.id) : null,
        attempt: job.attemptsMade + 1,
      });
    },
    {
      connection: redisConnection(),
      concurrency,
    }
  );

  worker.on('active', (job) => {
    log.info('воркер: job взята из очереди', {
      jobId: job.id,
      publicId: job.data?.publicId,
    });
  });

  worker.on('completed', (job, result) => {
    log.info('воркер: job completed', {
      jobId: job.id,
      publicId: job.data?.publicId,
      result,
    });
  });

  worker.on('failed', (job, err) => {
    log.error('воркер: job failed', {
      jobId: job?.id,
      publicId: job?.data?.publicId,
      attempt: job?.attemptsMade,
      error: err?.message,
    });
  });

  worker.on('error', (err) => {
    log.error('воркер: ошибка BullMQ', { error: err.message });
  });

  log.info('воркер: слушает очередь', { queue: QUEUE_NAME, concurrency });
}

main().catch((e) => {
  log.error('воркер: фатальная ошибка', { error: e.message });
  process.exit(1);
});
