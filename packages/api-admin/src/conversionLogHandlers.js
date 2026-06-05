const { serializeConversionLog } = require('db');
const { cancelTranscodeJob } = require('./transcodeQueue');

async function listConversionLogs(req, res) {
  const { ConversionLog } = this.dependencies;
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const publicId =
    typeof req.query.publicId === 'string' && req.query.publicId.trim()
      ? req.query.publicId.trim()
      : null;

  const filter = publicId ? { publicId } : {};

  const [total, rows] = await Promise.all([
    ConversionLog.countDocuments(filter),
    ConversionLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean(),
  ]);

  const items = rows.map((doc) => serializeConversionLog(doc));
  return res.status(200).json({ total, items });
}

async function cancelConversionJob(req, res) {
  const jobId = req.params.jobId;
  if (!jobId || !String(jobId).trim()) {
    return res.status(400).json({ message: 'jobId обязателен' });
  }

  const result = await cancelTranscodeJob(String(jobId).trim());
  if (!result.cancelled) {
    return res.status(409).json({ message: result.message || 'Не удалось отменить задачу' });
  }

  return res.status(200).json({
    cancelled: true,
    jobId: String(jobId).trim(),
    publicId: result.publicId || null,
    jobState: result.jobState || null,
  });
}

module.exports = { listConversionLogs, cancelConversionJob };
