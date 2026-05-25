const mongoose = require('mongoose');

const chunkStateSchema = new mongoose.Schema(
  {
    /** Порядковый номер chunk на сервере (0, 1, 2…). */
    lastIndex: { type: Number, default: -1 },
    /** Последний принятый X-Chunk-Index с клиента (для идемпотентности). */
    lastClientIndex: { type: Number, default: -1 },
    bytes: { type: Number, default: 0 },
  },
  { _id: false }
);

const recordingSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 500 },
    status: {
      type: String,
      required: true,
      enum: ['recording', 'processing', 'ready', 'failed'],
      default: 'recording',
    },
    publicId: { type: String, default: null, sparse: true, index: true },
    videoPublicId: { type: String, default: null },
    storageFileName: { type: String, default: null },
    processingError: { type: String, default: null },
    stagingPath: { type: String, required: true },
    tracksPlanned: { type: [String], default: [] },
    chunkState: {
      type: Map,
      of: chunkStateSchema,
      default: () => new Map(),
    },
    finalizedAt: { type: Date, default: null },
    readyAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.RecordingSession ||
  mongoose.model('RecordingSession', recordingSessionSchema);
