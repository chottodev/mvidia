import { computed, onUnmounted, ref } from 'vue';
import type { RecordingMeta, RecordingTrackId } from '../api/recordingApi';
import {
  createRecording,
  finalizeRecording,
  patchRecordingMeta,
  pollRecordingUntilReady,
  uploadTrackChunk,
} from '../api/recordingApi';
import { splitDisplayStream } from '../lib/splitDisplayStream';
import {
  canRecordWebmAudio,
  canRecordWebmVideo,
  isRecordingSupported,
  isRecordingUiAvailable,
  pickWebmAudioMimeType,
  pickWebmMimeForStream,
  pickWebmVideoMimeType,
} from '../lib/recorderMime';

export type RecorderPhase = 'idle' | 'recording' | 'stopping' | 'processing';

export type ScreencastStreamOptions = {
  title: string;
  useWebcam: boolean;
  useMic: boolean;
  useSystemAudio: boolean;
  webcamStream: MediaStream | null;
  micStream: MediaStream | null;
};

const TIMESLICE_MS = 2000;

type TrackRecorder = {
  trackId: RecordingTrackId;
  recorder: MediaRecorder;
  chunkIndex: number;
  mimeType: string;
  uploadQueue: Promise<void>;
};

export function useScreencastStreamRecorder() {
  const phase = ref<RecorderPhase>('idle');
  const error = ref('');
  const warning = ref('');
  const elapsedSec = ref(0);
  const sessionId = ref('');
  const resultPublicId = ref('');

  const uiAvailable = isRecordingUiAvailable();
  const supported = isRecordingSupported();
  const webmVideoAvailable = canRecordWebmVideo();

  let displayStream: MediaStream | null = null;
  let screenVideoStream: MediaStream | null = null;
  let systemAudioStream: MediaStream | null = null;
  let trackRecorders: TrackRecorder[] = [];
  /** Клоны треков только для MediaRecorder (превью не трогаем). */
  let recorderOnlyStreams: MediaStream[] = [];
  let sessionMeta: RecordingMeta | null = null;
  let timerId: ReturnType<typeof setInterval> | null = null;

  const formattedTime = computed(() => {
    const s = elapsedSec.value;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  });

  function clearTimer() {
    if (timerId != null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function releaseMedia() {
    for (const tr of trackRecorders) {
      try {
        if (tr.recorder.state !== 'inactive') tr.recorder.stop();
      } catch {
        /* ignore */
      }
    }
    trackRecorders = [];
    recorderOnlyStreams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    recorderOnlyStreams = [];
    displayStream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    displayStream = null;
    screenVideoStream = null;
    systemAudioStream = null;
    sessionMeta = null;
    clearTimer();
  }

  function enqueueUpload(tr: TrackRecorder, blob: Blob): void {
    if (blob.size === 0) return;
    tr.uploadQueue = tr.uploadQueue
      .then(async () => {
        const idx = tr.chunkIndex;
        await uploadTrackChunk(sessionId.value, tr.trackId, idx, blob, tr.mimeType);
        tr.chunkIndex += 1;
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Ошибка загрузки chunk';
        error.value = `Дорожка ${tr.trackId}, chunk ${tr.chunkIndex}: ${msg}`;
        throw e;
      });
  }

  function stopTrackRecorder(tr: TrackRecorder): Promise<void> {
    return new Promise((resolve, reject) => {
      const { recorder } = tr;
      if (recorder.state === 'inactive') {
        resolve();
        return;
      }
      recorder.addEventListener(
        'stop',
        () => resolve(),
        { once: true }
      );
      recorder.addEventListener(
        'error',
        () => reject(new Error(`Ошибка остановки «${tr.trackId}»`)),
        { once: true }
      );
      try {
        if (recorder.state === 'recording' || recorder.state === 'paused') {
          recorder.requestData();
          recorder.stop();
        } else {
          resolve();
        }
      } catch (e) {
        reject(e instanceof Error ? e : new Error('stop failed'));
      }
    });
  }

  function cloneTracksForRecorder(
    stream: MediaStream,
    kinds: Array<'video' | 'audio'>
  ): MediaStream {
    const tracks = kinds.flatMap((k) =>
      stream.getTracks().filter((t) => t.kind === k).map((t) => t.clone())
    );
    return new MediaStream(tracks);
  }

  function startTrackRecorder(trackId: RecordingTrackId, stream: MediaStream): TrackRecorder {
    const tracks = stream.getTracks();
    if (!tracks.length || tracks.some((t) => t.readyState !== 'live')) {
      throw new Error(`Поток «${trackId}» не готов к записи`);
    }

    const mimeType = pickWebmMimeForStream(stream);
    if (!mimeType) {
      throw new Error(`Браузер не поддерживает WebM для дорожки «${trackId}»`);
    }

    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType });
    } catch (e) {
      const hint = e instanceof Error ? e.message : '';
      throw new Error(`MediaRecorder (${trackId}, ${mimeType}): ${hint}`);
    }

    const tr: TrackRecorder = {
      trackId,
      recorder: rec,
      chunkIndex: 0,
      mimeType,
      uploadQueue: Promise.resolve(),
    };

    rec.ondataavailable = (e) => {
      enqueueUpload(tr, e.data);
    };

    rec.onerror = () => {
      error.value = `Ошибка записи дорожки ${trackId}`;
    };

    try {
      rec.start(TIMESLICE_MS);
    } catch (e) {
      const hint = e instanceof Error ? e.message : '';
      throw new Error(`Не удалось начать запись «${trackId}» (${mimeType}): ${hint}`);
    }
    trackRecorders.push(tr);
    return tr;
  }

  async function waitUploads(): Promise<void> {
    await Promise.all(trackRecorders.map((t) => t.uploadQueue));
  }

  function buildMeta(opts: ScreencastStreamOptions, startedPerf: number): RecordingMeta {
    const tracks: RecordingMeta['tracks'] = {
      screen: {
        enabled: true,
        startedAtPerf: startedPerf,
        mimeType: pickWebmVideoMimeType() || 'video/webm',
      },
    };
    let offset = 0.01;
    if (opts.useWebcam) {
      tracks.camera = {
        enabled: true,
        startedAtPerf: startedPerf + offset,
        mimeType: pickWebmVideoMimeType() || 'video/webm',
      };
      offset += 0.01;
    }
    if (opts.useMic && opts.micStream) {
      tracks.microphone = {
        enabled: true,
        startedAtPerf: startedPerf + offset,
        mimeType: pickWebmAudioMimeType() || 'audio/webm',
      };
      offset += 0.01;
    }
    if (opts.useSystemAudio && systemAudioStream) {
      tracks['system-audio'] = {
        enabled: true,
        startedAtPerf: startedPerf + offset,
        mimeType: pickWebmAudioMimeType() || 'audio/webm',
      };
    }
    return {
      sessionStartedAt: Date.now(),
      sessionStartedAtPerf: startedPerf,
      tracks,
      layout: { pip: { corner: 'bottom-right', widthRatio: 0.22, marginPx: 16 } },
    };
  }

  function plannedTracks(opts: ScreencastStreamOptions): RecordingTrackId[] {
    const list: RecordingTrackId[] = ['screen'];
    if (opts.useWebcam) list.push('camera');
    if (opts.useMic) list.push('microphone');
    if (opts.useSystemAudio) list.push('system-audio');
    return list;
  }

  async function start(options: ScreencastStreamOptions): Promise<void> {
    error.value = '';
    warning.value = '';
    resultPublicId.value = '';
    if (!uiAvailable || !supported) {
      error.value = 'Запись недоступна в этом браузере';
      return;
    }
    if (phase.value !== 'idle') return;

    const videoMime = pickWebmVideoMimeType();
    if (!videoMime) {
      error.value = 'Браузер не поддерживает запись WebM';
      return;
    }

    if (options.useWebcam && !options.webcamStream) {
      error.value = 'Включите камеру перед записью';
      return;
    }
    if (options.useMic && !options.micStream) {
      error.value = 'Включите микрофон перед записью';
      return;
    }

    try {
      const created = await createRecording(options.title, plannedTracks(options));

      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: options.useSystemAudio,
      });

      const split = splitDisplayStream(displayStream);
      screenVideoStream = split.screenVideo;
      systemAudioStream = options.useSystemAudio ? split.systemAudio : null;

      if (options.useSystemAudio && !systemAudioStream) {
        warning.value =
          'Звук вкладки/системы не передан. В диалоге Chrome при выборе экрана включите «Поделиться звуком вкладки» (или «Share tab audio»).';
      }

      sessionId.value = created.sessionId;
      trackRecorders = [];

      const startedPerf = performance.now();

      startTrackRecorder('screen', screenVideoStream);

      if (options.useWebcam && options.webcamStream) {
        const camStream = cloneTracksForRecorder(options.webcamStream, ['video']);
        recorderOnlyStreams.push(camStream);
        startTrackRecorder('camera', camStream);
      }

      if (options.useMic && options.micStream) {
        const micRecStream = cloneTracksForRecorder(options.micStream, ['audio']);
        recorderOnlyStreams.push(micRecStream);
        startTrackRecorder('microphone', micRecStream);
      }

      if (options.useSystemAudio && systemAudioStream) {
        const sysRecStream = cloneTracksForRecorder(systemAudioStream, ['audio']);
        recorderOnlyStreams.push(sysRecStream);
        startTrackRecorder('system-audio', sysRecStream);
      }

      sessionMeta = buildMeta(options, startedPerf);
      await patchRecordingMeta(sessionId.value, sessionMeta);

      const videoTrack = displayStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (phase.value === 'recording') void stop();
        };
      }

      phase.value = 'recording';
      elapsedSec.value = 0;
      timerId = setInterval(() => {
        elapsedSec.value += 1;
      }, 1000);
    } catch (e) {
      releaseMedia();
      sessionId.value = '';
      phase.value = 'idle';
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        error.value = 'Доступ к экрану не предоставлен';
      } else if (e instanceof DOMException && e.name === 'AbortError') {
        error.value = 'Выбор экрана отменён';
      } else {
        error.value = e instanceof Error ? e.message : 'Не удалось начать запись';
      }
    }
  }

  async function stop(): Promise<string> {
    if (phase.value !== 'recording' || !sessionId.value) {
      throw new Error('Запись не активна');
    }
    phase.value = 'stopping';
    clearTimer();

    try {
      await Promise.all(trackRecorders.map((tr) => stopTrackRecorder(tr)));
      await waitUploads();

      if (sessionMeta) {
        await patchRecordingMeta(sessionId.value, sessionMeta);
      }

      releaseMedia();

      const fin = await finalizeRecording(sessionId.value);
      phase.value = 'processing';

      const done = await pollRecordingUntilReady(sessionId.value);
      resultPublicId.value = done.videoPublicId || fin.publicId;
      phase.value = 'idle';
      elapsedSec.value = 0;
      return resultPublicId.value;
    } catch (e) {
      releaseMedia();
      phase.value = 'idle';
      elapsedSec.value = 0;
      const msg = e instanceof Error ? e.message : 'Не удалось завершить запись';
      error.value = msg;
      throw e instanceof Error ? e : new Error(msg);
    }
  }

  onUnmounted(() => {
    for (const tr of trackRecorders) {
      try {
        if (tr.recorder.state === 'recording') tr.recorder.stop();
      } catch {
        /* ignore */
      }
    }
    releaseMedia();
    phase.value = 'idle';
  });

  return {
    phase,
    error,
    warning,
    elapsedSec,
    formattedTime,
    sessionId,
    resultPublicId,
    uiAvailable,
    supported,
    webmVideoAvailable,
    canRecordWebmAudio,
    start,
    stop,
  };
}
