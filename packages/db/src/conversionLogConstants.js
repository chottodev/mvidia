const CONVERSION_LOG_STATUS = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
};

const TRANSCODE_QUEUE_NAME = 'video-transcode';

function transcodeCancelRedisKey(jobId) {
  return `mvidia:transcode:cancel:${jobId}`;
}

module.exports = { CONVERSION_LOG_STATUS, TRANSCODE_QUEUE_NAME, transcodeCancelRedisKey };
