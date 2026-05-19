const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, unique: true, index: true },
    storageFileName: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 500 },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Video || mongoose.model('Video', videoSchema);
