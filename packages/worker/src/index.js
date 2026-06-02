const path = require('path');
const fs = require('fs/promises');
const { Worker } = require('bullmq');
const {
  connect,
  migrateVideosWithoutStatus,
  Video,
  videoPaths,
} = require('db');
const { processTranscodeJob } = require('./processTranscodeJob');

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

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mvidia';
  await connect(mongoUri);
  await migrateVideosWithoutStatus();

  const uploadDirAbs = path.resolve(
    rootDir,
    (process.env.UPLOAD_DIR || 'uploads').replace(/^\.\//, '')
  );
  await fs.mkdir(uploadDirAbs, { recursive: true });
  await fs.mkdir(path.join(uploadDirAbs, videoPaths.SOURCES_SUBDIR), { recursive: true });
  await fs.mkdir(path.join(uploadDirAbs, videoPaths.POSTERS_SUBDIR), { recursive: true });

  const concurrency = Math.max(1, parseInt(process.env.WORKER_CONCURRENCY || '1', 10));

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { publicId } = job.data;
      if (!publicId) throw new Error('job без publicId');

      return processTranscodeJob(publicId, uploadDirAbs);
    },
    {
      connection: redisConnection(),
      concurrency,
    }
  );

  worker.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`[worker] job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    // eslint-disable-next-line no-console
    console.log(`[worker] job ${job.id} completed`);
  });

  // eslint-disable-next-line no-console
  console.log(`mvidia worker: queue=${QUEUE_NAME}, concurrency=${concurrency}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
