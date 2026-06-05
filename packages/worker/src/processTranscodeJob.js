const fs = require('fs/promises');
const {
  Video,
  ConversionLog,
  CONVERSION_LOG_STATUS,
  VIDEO_STATUS,
  PROCESSING_STEP,
  videoPaths,
  createLogger,
} = require('db');
const { produceDeliveryMp4, deliveryFileSize } = require('./transcode');
const { generatePosterFromVideo } = require('./poster');
const { isTranscodeCancelled, clearTranscodeCancel } = require('./transcodeCancel');

const log = createLogger('worker');
const CANCEL_MESSAGE = 'Отменено администратором';

async function resolveSourceSizeBytes(doc, sourceAbs) {
  if (doc.sourceSizeBytes > 0) return doc.sourceSizeBytes;
  try {
    const stat = await fs.stat(sourceAbs);
    return stat.size;
  } catch {
    return null;
  }
}

async function finishConversionLog(logId, patch) {
  if (!logId) return;
  try {
    await ConversionLog.findByIdAndUpdate(logId, {
      ...patch,
      finishedAt: new Date(),
    });
  } catch (e) {
    log.warn('журнал конвертации: не удалось обновить запись', {
      logId: String(logId),
      error: e.message,
    });
  }
}

async function processTranscodeJob(publicId, uploadDirAbs, jobMeta = {}) {
  const startedAt = Date.now();
  const { jobId = null, attempt = 1 } = jobMeta;
  let conversionLogId = null;

  log.info('обработка: старт', { publicId, jobId, attempt });

  const doc = await Video.findOne({ publicId });
  if (!doc) {
    log.error('обработка: видео не найдено в БД', { publicId });
    throw new Error(`Video not found: ${publicId}`);
  }

  const sourceAbs = videoPaths.sourcePath(uploadDirAbs, doc.sourceFileName);
  const sourceSizeBytes = await resolveSourceSizeBytes(doc, sourceAbs);

  if (doc.status === VIDEO_STATUS.READY) {
    log.info('обработка: уже ready, пропуск', { publicId });
    try {
      await ConversionLog.create({
        publicId,
        jobId,
        attempt,
        status: CONVERSION_LOG_STATUS.SKIPPED,
        sourceSizeBytes,
        workDurationMs: Date.now() - startedAt,
        finishedAt: new Date(),
      });
    } catch (e) {
      log.warn('журнал конвертации: пропуск не записан', { publicId, error: e.message });
    }
    return { skipped: true };
  }

  try {
    const journalEntry = await ConversionLog.create({
      publicId,
      jobId,
      attempt,
      status: CONVERSION_LOG_STATUS.RUNNING,
      sourceSizeBytes,
    });
    conversionLogId = journalEntry._id;
  } catch (e) {
    log.warn('журнал конвертации: старт не записан', { publicId, error: e.message });
  }

  doc.processingStep = PROCESSING_STEP.CONVERTING;
  await doc.save();
  log.info('обработка: конвертация', {
    publicId,
    processingStep: PROCESSING_STEP.CONVERTING,
    sourceFileName: doc.sourceFileName,
  });

  const deliveryAbs = videoPaths.deliveryPath(uploadDirAbs, doc.storageFileName);
  const posterAbs = videoPaths.posterPath(uploadDirAbs, doc.storageFileName);

  try {
    if (await isTranscodeCancelled(jobId)) {
      throw new Error(CANCEL_MESSAGE);
    }

    const transcodeStarted = Date.now();
    const transcodeMeta = await produceDeliveryMp4(sourceAbs, deliveryAbs, { jobId });
    const sizeBytes = await deliveryFileSize(deliveryAbs);
    log.info('обработка: delivery готов', {
      publicId,
      usedCopy: transcodeMeta.usedCopy,
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

    const workDurationMs = Date.now() - startedAt;
    await finishConversionLog(conversionLogId, {
      status: CONVERSION_LOG_STATUS.COMPLETED,
      sourceSizeBytes: transcodeMeta.sourceSizeBytes ?? sourceSizeBytes,
      videoDurationSec: transcodeMeta.videoDurationSec,
      workDurationMs,
      strategy: transcodeMeta.profileId || transcodeMeta.strategy,
      usedCopy: transcodeMeta.usedCopy,
      deliverySizeBytes: sizeBytes,
      errorMessage: null,
    });

    log.info('обработка: завершена успешно', {
      publicId,
      status: VIDEO_STATUS.READY,
      sizeBytes,
      totalDurationMs: workDurationMs,
    });

    await clearTranscodeCancel(jobId);
    return { publicId, sizeBytes };
  } catch (e) {
    const message = (e && e.message) || 'Ошибка конвертации';
    const cancelled =
      message === CANCEL_MESSAGE || (jobId && (await isTranscodeCancelled(jobId)));

    doc.status = VIDEO_STATUS.FAILED;
    doc.errorMessage = cancelled ? CANCEL_MESSAGE : message;
    doc.processingStep = undefined;
    await doc.save();

    const workDurationMs = Date.now() - startedAt;
    await finishConversionLog(conversionLogId, {
      status: cancelled ? CONVERSION_LOG_STATUS.CANCELLED : CONVERSION_LOG_STATUS.FAILED,
      sourceSizeBytes,
      workDurationMs,
      errorMessage: cancelled ? CANCEL_MESSAGE : message,
    });

    await clearTranscodeCancel(jobId);

    log.error('обработка: ошибка', {
      publicId,
      jobId,
      status: cancelled ? CONVERSION_LOG_STATUS.CANCELLED : VIDEO_STATUS.FAILED,
      error: cancelled ? CANCEL_MESSAGE : message,
      totalDurationMs: workDurationMs,
    });
    throw e;
  }
}

module.exports = { processTranscodeJob };
