function serializeConversionLog(doc) {
  return {
    id: String(doc._id),
    publicId: doc.publicId,
    jobId: doc.jobId || null,
    attempt: doc.attempt ?? 1,
    status: doc.status,
    sourceSizeBytes: doc.sourceSizeBytes ?? null,
    videoDurationSec: doc.videoDurationSec ?? null,
    workDurationMs: doc.workDurationMs ?? null,
    strategy: doc.strategy || null,
    usedCopy: doc.usedCopy ?? null,
    deliverySizeBytes: doc.deliverySizeBytes ?? null,
    errorMessage: doc.errorMessage || null,
    startedAt: doc.createdAt,
    finishedAt: doc.finishedAt || null,
  };
}

module.exports = { serializeConversionLog };
