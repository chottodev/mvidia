const Redis = require('ioredis');
const { transcodeCancelRedisKey } = require('db');

let client;

function getRedis() {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  client = new Redis(url, { maxRetriesPerRequest: null });
  return client;
}

async function isTranscodeCancelled(jobId) {
  if (!jobId) return false;
  const redis = getRedis();
  if (!redis) return false;
  return (await redis.get(transcodeCancelRedisKey(jobId))) === '1';
}

async function clearTranscodeCancel(jobId) {
  if (!jobId) return;
  const redis = getRedis();
  if (!redis) return;
  await redis.del(transcodeCancelRedisKey(jobId)).catch(() => {});
}

module.exports = { isTranscodeCancelled, clearTranscodeCancel };
