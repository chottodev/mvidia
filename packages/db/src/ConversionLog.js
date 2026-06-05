const mongoose = require('mongoose');
const { CONVERSION_LOG_STATUS } = require('./conversionLogConstants');

const conversionLogSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, index: true },
    jobId: { type: String, default: null },
    attempt: { type: Number, default: 1, min: 1 },
    status: {
      type: String,
      enum: Object.values(CONVERSION_LOG_STATUS),
      required: true,
      index: true,
    },
    sourceSizeBytes: { type: Number, min: 0, default: null },
    videoDurationSec: { type: Number, min: 0, default: null },
    workDurationMs: { type: Number, min: 0, default: null },
    strategy: { type: String, default: null },
    usedCopy: { type: Boolean, default: null },
    deliverySizeBytes: { type: Number, min: 0, default: null },
    errorMessage: { type: String, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

conversionLogSchema.index({ createdAt: -1 });
conversionLogSchema.index({ publicId: 1, createdAt: -1 });

module.exports =
  mongoose.models.ConversionLog || mongoose.model('ConversionLog', conversionLogSchema);
