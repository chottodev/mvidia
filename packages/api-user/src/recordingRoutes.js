const path = require('path');
const fs = require('fs/promises');
const fsc = require('fs');
const express = require('express');
const { randomUUID } = require('crypto');
const { customAlphabet } = require('nanoid');
const { mergeScreencast, TRACK_FILES } = require('./mergeScreencast');
const { assertBrowserPlayableMp4 } = require('./mp4Probe');

const VALID_TRACKS = new Set(['screen', 'camera', 'microphone', 'system-audio']);
const publicIdAlphabet =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const createPublicId = customAlphabet(publicIdAlphabet, 20);

function trackFileName(trackId) {
  return TRACK_FILES[trackId];
}

function sessionToJson(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  const chunkState = {};
  if (o.chunkState && typeof o.chunkState.forEach === 'function') {
    o.chunkState.forEach((v, k) => {
      chunkState[k] = v;
    });
  } else if (o.chunkState) {
    Object.assign(chunkState, o.chunkState);
  }
  return {
    sessionId: o.sessionId,
    status: o.status,
    publicId: o.publicId ?? null,
    videoPublicId: o.videoPublicId ?? null,
    title: o.title,
    processingError: o.processingError ?? null,
    tracksPlanned: o.tracksPlanned || [],
    chunkState,
    createdAt: o.createdAt,
    finalizedAt: o.finalizedAt ?? null,
    readyAt: o.readyAt ?? null,
  };
}

function logRecording(...args) {
  // eslint-disable-next-line no-console
  console.log('[recording]', ...args);
}

function formatProcessingError(e) {
  const raw = e && e.message ? String(e.message) : 'Ошибка обработки';
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const invalid = lines.find((l) => /Invalid data found/i.test(l));
  if (invalid) {
    const m = invalid.match(/([^:]+):\s*Invalid data/i);
    const file = m ? path.basename(m[1].trim()) : 'дорожки';
    return `Повреждённый файл ${file}. Запишите снова.`;
  }
  const useful = lines.filter(
    (l) =>
      !/^(ffmpeg|ffprobe) version/i.test(l) &&
      !/^(libavutil|libavcodec|libavformat|libavdevice|libavfilter|libavresample|libswscale|libswresample|libpostproc)\s/.test(
        l
      ) &&
      !/enable-|configuration:/i.test(l)
  );
  const line = useful[useful.length - 1] || raw;
  const short = line.replace(/^ffmpeg exit \d+:\s*/i, '').trim();
  return short.slice(0, 500);
}

/** Сериализация append по sessionId+trackId (параллельные fetch с одной дорожки). */
const trackChunkLocks = new Map();

async function withTrackChunkLock(key, fn) {
  const prev = trackChunkLocks.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  trackChunkLocks.set(key, prev.then(() => gate));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function createRecordingRouter(deps) {
  const { RecordingSession, Video, uploadDirAbs } = deps;
  const stagingRoot = path.join(uploadDirAbs, 'staging');
  const archiveRoot = path.join(uploadDirAbs, 'archive');

  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));

  router.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logRecording(req.method, req.originalUrl, res.statusCode, `${Date.now() - start}ms`);
    });
    next();
  });

  router.post('/', async (req, res, next) => {
    try {
      const title = String(req.body?.title || '').trim();
      const tracks = Array.isArray(req.body?.tracks) ? req.body.tracks : ['screen'];
      if (!title) {
        return res.status(400).json({ message: 'Название обязательно' });
      }
      if (!tracks.includes('screen')) {
        return res.status(400).json({ message: 'Дорожка screen обязательна' });
      }
      for (const t of tracks) {
        if (!VALID_TRACKS.has(t)) {
          return res.status(400).json({ message: `Неизвестная дорожка: ${t}` });
        }
      }

      const sessionId = randomUUID();
      const stagingPath = path.join(stagingRoot, sessionId);
      await fs.mkdir(stagingPath, { recursive: true });

      await RecordingSession.create({
        sessionId,
        title,
        status: 'recording',
        stagingPath,
        tracksPlanned: tracks,
      });

      const base = `/recordings/${sessionId}`;
      const trackUrls = {};
      for (const t of tracks) {
        trackUrls[t] = { chunkUrl: `${base}/tracks/${t}/chunks` };
      }

      return res.status(201).json({
        sessionId,
        status: 'recording',
        tracks: trackUrls,
        metaUrl: `${base}/meta`,
        finalizeUrl: `${base}/finalize`,
        statusUrl: base,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/:sessionId', async (req, res, next) => {
    try {
      const doc = await RecordingSession.findOne({ sessionId: req.params.sessionId });
      if (!doc) return res.status(404).json({ message: 'Сессия не найдена' });
      return res.status(200).json(sessionToJson(doc));
    } catch (e) {
      return next(e);
    }
  });

  router.patch('/:sessionId/meta', async (req, res, next) => {
    try {
      const doc = await RecordingSession.findOne({ sessionId: req.params.sessionId });
      if (!doc) return res.status(404).json({ message: 'Сессия не найдена' });
      if (doc.status !== 'recording') {
        return res.status(409).json({ message: 'Сессия не принимает meta' });
      }
      const metaPath = path.join(doc.stagingPath, 'meta.json');
      await fs.writeFile(metaPath, JSON.stringify(req.body || {}), 'utf8');
      return res.status(200).json({ ok: true });
    } catch (e) {
      return next(e);
    }
  });

  router.post(
    '/:sessionId/tracks/:trackId/chunks',
    express.raw({ type: () => true, limit: '64mb' }),
    async (req, res, next) => {
      const { sessionId, trackId } = req.params;
      if (!VALID_TRACKS.has(trackId)) {
        return res.status(400).json({ message: 'Неизвестная дорожка' });
      }

      const clientChunkIndex = parseInt(String(req.headers['x-chunk-index'] ?? ''), 10);
      if (Number.isNaN(clientChunkIndex) || clientChunkIndex < 0) {
        return res.status(400).json({ message: 'Заголовок X-Chunk-Index обязателен' });
      }

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return res.status(400).json({ message: 'Пустое тело chunk' });
      }

      const lockKey = `${sessionId}:${trackId}`;

      try {
        await withTrackChunkLock(lockKey, async () => {
          const doc = await RecordingSession.findOne({ sessionId });
          if (!doc) {
            const err = new Error('Сессия не найдена');
            err.status = 404;
            throw err;
          }
          if (doc.status !== 'recording') {
            const err = new Error('Приём chunks закрыт');
            err.status = 409;
            throw err;
          }
          if (!doc.tracksPlanned.includes(trackId)) {
            const err = new Error('Дорожка не объявлена в сессии');
            err.status = 400;
            throw err;
          }

          const stagingPath = doc.stagingPath;
          const filePath = path.join(stagingPath, trackFileName(trackId));
          const lastClientPath = path.join(stagingPath, `.${trackId}.lastclient`);
          const serverIdxPath = path.join(stagingPath, `.${trackId}.serveridx`);

          let lastClientIndex = -1;
          try {
            lastClientIndex = parseInt(await fs.readFile(lastClientPath, 'utf8'), 10);
          } catch {
            /* first chunk */
          }
          if (clientChunkIndex <= lastClientIndex) {
            return;
          }

          let fileSize = 0;
          try {
            fileSize = (await fs.stat(filePath)).size;
          } catch {
            /* new file */
          }

          let serverChunkIndex;
          if (fileSize === 0) {
            await fs.writeFile(filePath, body);
            serverChunkIndex = 0;
          } else {
            await fs.appendFile(filePath, body);
            let prevServer = -1;
            try {
              prevServer = parseInt(await fs.readFile(serverIdxPath, 'utf8'), 10);
            } catch {
              /* first append after legacy file */
            }
            serverChunkIndex = prevServer + 1;
          }

          await fs.writeFile(lastClientPath, String(clientChunkIndex));
          await fs.writeFile(serverIdxPath, String(serverChunkIndex));

          const stat = await fs.stat(filePath);
          const trackState = {
            lastIndex: serverChunkIndex,
            lastClientIndex: clientChunkIndex,
            bytes: stat.size,
          };
          await RecordingSession.updateOne(
            { sessionId },
            [
              {
                $set: {
                  chunkState: {
                    $mergeObjects: [
                      { $ifNull: ['$chunkState', {}] },
                      { [trackId]: trackState },
                    ],
                  },
                },
              },
            ]
          );

          logRecording(
            'chunk',
            sessionId,
            trackId,
            `#${serverChunkIndex}`,
            `(client ${clientChunkIndex})`,
            `${body.length}B`
          );
        });

        return res.status(204).send();
      } catch (e) {
        if (e && e.status) {
          return res.status(e.status).json({ message: e.message });
        }
        return next(e);
      }
    }
  );

  async function listStagingTracks(stagingPath) {
    const names = await fs.readdir(stagingPath);
    const tracks = [];
    for (const name of names) {
      if (!name.endsWith('.webm')) continue;
      const st = await fs.stat(path.join(stagingPath, name));
      tracks.push({ name, bytes: st.size });
    }
    return tracks;
  }

  async function runMergeJob(sessionId) {
    const doc = await RecordingSession.findOne({ sessionId });
    if (!doc || doc.status !== 'processing') return;

    await new Promise((r) => setTimeout(r, 400));

    const docFresh = await RecordingSession.findOne({ sessionId });
    if (!docFresh || docFresh.status !== 'processing') return;

    const stagingFiles = await listStagingTracks(docFresh.stagingPath);
    const planned = docFresh.tracksPlanned || ['screen'];
    for (const trackId of planned) {
      const fname = trackFileName(trackId);
      const found = stagingFiles.find((f) => f.name === fname && f.bytes > 0);
      if (!found && trackId !== 'screen') {
        logRecording('merge warn: missing track file', sessionId, trackId);
      }
    }
    logRecording('merge start', sessionId, 'files:', stagingFiles);

    const tempOut = path.join(docFresh.stagingPath, `_merge-${randomUUID()}.mp4`);
    try {
      await mergeScreencast({
        stagingDir: docFresh.stagingPath,
        outputPath: tempOut,
      });
      logRecording('merge done', sessionId, tempOut);
      await assertBrowserPlayableMp4(tempOut);
      const stat = await fs.stat(tempOut);
      const storageFileName = `${randomUUID()}.mp4`;
      const dest = path.join(uploadDirAbs, storageFileName);
      await fs.rename(tempOut, dest);

      let publicId = docFresh.publicId;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          await Video.create({
            publicId,
            storageFileName,
            title: docFresh.title,
            mimeType: 'video/mp4',
            sizeBytes: stat.size,
          });
          break;
        } catch (e) {
          if (e && e.code === 11000) {
            publicId = createPublicId();
            continue;
          }
          throw e;
        }
      }

      const archivePath = path.join(archiveRoot, docFresh.sessionId);
      await fs.mkdir(archiveRoot, { recursive: true });
      try {
        await fs.rename(docFresh.stagingPath, archivePath);
      } catch {
        await fs.cp(docFresh.stagingPath, archivePath, { recursive: true });
        await fs.rm(docFresh.stagingPath, { recursive: true, force: true });
      }

      docFresh.status = 'ready';
      docFresh.videoPublicId = publicId;
      docFresh.publicId = publicId;
      docFresh.storageFileName = storageFileName;
      docFresh.readyAt = new Date();
      docFresh.processingError = null;
      await docFresh.save();
      logRecording('ready', sessionId, publicId, `${stat.size}B`);
    } catch (e) {
      await fs.unlink(tempOut).catch(() => {});
      logRecording('merge failed', sessionId, e && e.message ? e.message : e);
      const failDoc = await RecordingSession.findOne({ sessionId });
      if (!failDoc) return;
      failDoc.status = 'failed';
      if (e && e.code === 'ENOENT') {
        failDoc.processingError = 'ffmpeg не установлен на сервере';
      } else {
        failDoc.processingError = formatProcessingError(e);
      }
      await failDoc.save();
    }
  }

  router.post('/:sessionId/finalize', async (req, res, next) => {
    try {
      const doc = await RecordingSession.findOne({ sessionId: req.params.sessionId });
      if (!doc) return res.status(404).json({ message: 'Сессия не найдена' });

      if (doc.status === 'ready') {
        return res.status(200).json({
          sessionId: doc.sessionId,
          publicId: doc.publicId,
          status: 'ready',
          pollUrl: `/recordings/${doc.sessionId}`,
          videoPublicId: doc.videoPublicId,
        });
      }
      if (doc.status === 'processing') {
        return res.status(202).json({
          sessionId: doc.sessionId,
          publicId: doc.publicId,
          status: 'processing',
          pollUrl: `/recordings/${doc.sessionId}`,
        });
      }
      if (doc.status === 'failed') {
        return res.status(409).json({
          message: doc.processingError || 'Сессия завершилась с ошибкой',
        });
      }

      const screenState = doc.chunkState.get('screen');
      if (!screenState || screenState.lastIndex < 0) {
        return res.status(400).json({ message: 'Нет данных дорожки screen' });
      }

      let publicId = doc.publicId;
      if (!publicId) {
        publicId = createPublicId();
        doc.publicId = publicId;
      }
      doc.status = 'processing';
      doc.finalizedAt = new Date();
      await doc.save();

      const sid = doc.sessionId;
      const planned = doc.tracksPlanned || [];
      const chunkSummary = {};
      for (const t of planned) {
        const st = doc.chunkState.get(t);
        chunkSummary[t] = st ? { lastIndex: st.lastIndex, bytes: st.bytes } : null;
      }
      logRecording('finalize', sid, { planned, chunkSummary });

      setImmediate(() => {
        runMergeJob(sid).catch((err) => {
          logRecording('merge crash', sid, err);
        });
      });

      return res.status(202).json({
        sessionId: doc.sessionId,
        publicId,
        status: 'processing',
        pollUrl: `/recordings/${doc.sessionId}`,
      });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}

module.exports = { createRecordingRouter };
