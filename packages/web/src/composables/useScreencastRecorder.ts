import { computed, onUnmounted, ref } from 'vue';
import {
  cloneWebcamForComposite,
  createCompositeStream,
  type CompositeStreamHandle,
} from '../lib/compositeStream';
import {
  canRecordMp4Video,
  isRecordingSupported,
  isRecordingUiAvailable,
  pickRecorderMimeType,
} from '../lib/recorderMime';

export type RecorderPhase = 'idle' | 'recording' | 'stopping';

export type ScreencastRecordOptions = {
  useWebcam: boolean;
  useMic: boolean;
  webcamStream: MediaStream | null;
  micStream: MediaStream | null;
};

const ONE_GB = 1024 * 1024 * 1024;

export function useScreencastRecorder() {
  const phase = ref<RecorderPhase>('idle');
  const error = ref('');
  const elapsedSec = ref(0);

  const uiAvailable = isRecordingUiAvailable();
  const supported = isRecordingSupported();
  const mp4VideoAvailable = canRecordMp4Video();

  let screenStream: MediaStream | null = null;
  let clonedWebcamStream: MediaStream | null = null;
  let composite: CompositeStreamHandle | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: BlobPart[] = [];
  let timerId: ReturnType<typeof setInterval> | null = null;
  let stopResolve: ((file: File) => void) | null = null;
  let stopReject: ((err: Error) => void) | null = null;
  let stopInterrupted = false;

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

  function releaseRecording() {
    composite?.stop();
    composite = null;
    clonedWebcamStream?.getTracks().forEach((t) => t.stop());
    clonedWebcamStream = null;
    screenStream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    screenStream = null;
    recorder = null;
    clearTimer();
  }

  function attachTrackEndedHandlers(recordStream: MediaStream) {
    recordStream.getTracks().forEach((track) => {
      track.onended = () => {
        if (phase.value !== 'recording') return;
        error.value =
          track.kind === 'video'
            ? 'Видеопоток оборвался (захват экрана или композит)'
            : 'Аудиопоток оборвался';
        requestStop({ interrupted: true });
      };
    });
  }

  function failStop(err: Error) {
    releaseRecording();
    phase.value = 'idle';
    elapsedSec.value = 0;
    stopReject?.(err);
    stopResolve = null;
    stopReject = null;
  }

  async function start(options: ScreencastRecordOptions): Promise<void> {
    error.value = '';
    if (!uiAvailable) {
      error.value = 'Запись недоступна в этом браузере';
      return;
    }
    if (phase.value !== 'idle') return;

    const withAudio = options.useMic && !!options.micStream?.getAudioTracks().length;
    const mimeType = pickRecorderMimeType({ withAudio });
    if (!mimeType) {
      error.value =
        'Этот браузер не умеет записывать MP4 (H.264). На Linux так бывает — попробуйте Chrome на Windows/macOS или загрузите файл вручную.';
      return;
    }

    if (options.useWebcam && !options.webcamStream) {
      error.value = 'Включите камеру и разрешите доступ перед записью';
      return;
    }
    if (options.useMic && !options.micStream) {
      error.value = 'Включите микрофон и разрешите доступ перед записью';
      return;
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      screenStream = display;

      clonedWebcamStream =
        options.useWebcam && options.webcamStream
          ? cloneWebcamForComposite(options.webcamStream)
          : null;

      composite = createCompositeStream({
        screenStream: display,
        webcamStream: clonedWebcamStream,
        micStream: options.useMic ? options.micStream : null,
      });
      await composite.ready;

      const recordStream = composite.stream;
      attachTrackEndedHandlers(recordStream);
      chunks = [];
      stopInterrupted = false;

      const rec = new MediaRecorder(recordStream, { mimeType });
      recorder = rec;

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      rec.onerror = () => {
        failStop(new Error('Ошибка во время записи'));
      };

      rec.onstop = () => {
        clearTimer();
        const blob = new Blob(chunks, { type: 'video/mp4' });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const file = new File([blob], `screencast-${ts}.mp4`, { type: 'video/mp4' });
        releaseRecording();
        phase.value = 'idle';
        elapsedSec.value = 0;

        if (stopInterrupted) {
          error.value = 'Запись прервана';
          stopReject?.(new Error('Запись прервана'));
        } else if (file.size === 0) {
          const err = new Error('Запись пуста');
          error.value = err.message;
          stopReject?.(err);
        } else if (file.size > ONE_GB) {
          const err = new Error('Размер записи превышает 1 ГБ');
          error.value = err.message;
          stopReject?.(err);
        } else {
          stopResolve?.(file);
        }
        stopResolve = null;
        stopReject = null;
      };

      const videoTrack = display.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (phase.value === 'recording') {
            requestStop({ interrupted: true });
          }
        };
      }

      rec.start(1000);
      phase.value = 'recording';
      elapsedSec.value = 0;
      timerId = setInterval(() => {
        elapsedSec.value += 1;
      }, 1000);
    } catch (e) {
      releaseRecording();
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

  function requestStop(opts?: { interrupted?: boolean }) {
    if (phase.value !== 'recording' || !recorder) return;
    stopInterrupted = !!opts?.interrupted;
    phase.value = 'stopping';
    try {
      if (recorder.state === 'recording') {
        recorder.requestData();
        recorder.stop();
      } else if (recorder.state === 'paused') {
        recorder.stop();
      }
    } catch (e) {
      failStop(e instanceof Error ? e : new Error('Не удалось остановить запись'));
    }
  }

  function stop(opts?: { interrupted?: boolean }): Promise<File> {
    return new Promise((resolve, reject) => {
      if (phase.value !== 'recording' || !recorder) {
        reject(new Error('Запись не активна'));
        return;
      }
      stopResolve = resolve;
      stopReject = reject;
      requestStop(opts);
    });
  }

  onUnmounted(() => {
    if (recorder?.state === 'recording') {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    releaseRecording();
    phase.value = 'idle';
  });

  return {
    phase,
    error,
    elapsedSec,
    formattedTime,
    uiAvailable,
    supported,
    mp4VideoAvailable,
    start,
    stop,
  };
}
