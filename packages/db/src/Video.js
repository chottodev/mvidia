const mongoose = require('mongoose');
const { VIDEO_STATUS, PROCESSING_STEP, VIDEO_VISIBILITY } = require('./videoConstants');

const videoSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, unique: true, index: true },
    storageFileName: { type: String, required: true },
    sourceFileName: { type: String, required: true },
    sourceMimeType: { type: String, required: true },
    sourceSizeBytes: { type: Number, required: true, min: 0 },
    title: { type: String, required: true, trim: true, maxlength: 75 },
    description: { type: String, default: '', trim: true, maxlength: 300 },
    visibility: {
      type: String,
      enum: Object.values(VIDEO_VISIBILITY),
      default: VIDEO_VISIBILITY.PUBLIC,
      index: true,
    },
    mimeType: { type: String, required: true, default: 'video/mp4' },
    sizeBytes: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: Object.values(VIDEO_STATUS),
      required: true,
      default: VIDEO_STATUS.NOT_READY,
      index: true,
    },
    processingStep: {
      type: String,
      enum: Object.values(PROCESSING_STEP),
      required: false,
    },
    errorMessage: { type: String, maxlength: 2000 },
    authorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
      sparse: true,
    },
    authorNameSnapshot: { type: String, maxlength: 100, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Video || mongoose.model('Video', videoSchema);
