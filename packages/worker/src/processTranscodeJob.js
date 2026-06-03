const {
  Video,
  VIDEO_STATUS,
  PROCESSING_STEP,
  videoPaths,
  createLogger,
} = require('db');
const { produceDeliveryMp4, deliveryFileSize } = require('./transcode');
const { generatePosterFromVideo } = require('./poster');

const log = createLogger('worker');

async function processTranscodeJob(publicId, uploadDirAbs) {
  const startedAt = Date.now();
  log.info('обработка: старт', { publicId });

  const doc = await Video.findOne({ publicId });
  if (!doc) {
    log.error('обработка: видео не найдено в БД', { publicId });
    throw new Error(`Video not found: ${publicId}`);
  }
  if (doc.status === VIDEO_STATUS.READY) {
    log.info('обработка: уже ready, пропуск', { publicId });
    return { skipped: true };
  }

  doc.processingStep = PROCESSING_STEP.CONVERTING;
  await doc.save();
  log.info('обработка: конвертация', {
    publicId,
    processingStep: PROCESSING_STEP.CONVERTING,
    sourceFileName: doc.sourceFileName,
  });

  const sourceAbs = videoPaths.sourcePath(uploadDirAbs, doc.sourceFileName);
  const deliveryAbs = videoPaths.deliveryPath(uploadDirAbs, doc.storageFileName);
  const posterAbs = videoPaths.posterPath(uploadDirAbs, doc.storageFileName);

  try {
    const transcodeStarted = Date.now();
    const { usedCopy } = await produceDeliveryMp4(sourceAbs, deliveryAbs);
    const sizeBytes = await deliveryFileSize(deliveryAbs);
    log.info('обработка: delivery готов', {
      publicId,
      usedCopy,
      sizeBytes,
      durationMs: Date.now() - transcodeStarted,
    });

    doc.processingStep = PROCESSING_STEP.FINALIZING;
    await doc.save();
    log.info('обработка: финализация', {
      publicId,
      processingStep: PROCESSING_STEP.FINALIZING,
    });

    if (posterAbs) {
      const posterOk = await generatePosterFromVideo(deliveryAbs, posterAbs);
      log.info('обработка: постер', { publicId, ok: posterOk });
    }

    doc.status = VIDEO_STATUS.READY;
    doc.processingStep = undefined;
    doc.errorMessage = undefined;
    doc.sizeBytes = sizeBytes;
    doc.mimeType = 'video/mp4';
    await doc.save();

    log.info('обработка: завершена успешно', {
      publicId,
      status: VIDEO_STATUS.READY,
      sizeBytes,
      totalDurationMs: Date.now() - startedAt,
    });

    return { publicId, sizeBytes };
  } catch (e) {
    const message = (e && e.message) || 'Ошибка конвертации';
    doc.status = VIDEO_STATUS.FAILED;
    doc.errorMessage = message;
    doc.processingStep = undefined;
    await doc.save();
    log.error('обработка: ошибка', {
      publicId,
      status: VIDEO_STATUS.FAILED,
      error: message,
      totalDurationMs: Date.now() - startedAt,
    });
    throw e;
  }
}

module.exports = { processTranscodeJob };
