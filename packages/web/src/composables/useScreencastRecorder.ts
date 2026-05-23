import { computed, onUnmounted, ref } from 'vue';
import {
  canRecordMp4,
  isRecordingSupported,
  isRecordingUiAvailable,
  pickRecorderMimeType,
} from '../lib/recorderMime';

export type RecorderPhase = 'idle' | 'recording' | 'stopping';

const ONE_GB = 1024 * 1024 * 1024;

export function useScreencastRecorder() {
  const phase = ref<RecorderPhase>('idle');
  const error = ref('');
  const elapsedSec = ref(0);

  const uiAvailable = isRecordingUiAvailable();
  const supported = isRecordingSupported();
  const mp4Available = canRecordMp4();
  const mimeType = pickRecorderMimeType();

  let stream: MediaStream | null = null;
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

  function releaseStream() {
    stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    stream = null;
    recorder = null;
    clearTimer();
  }

  function failStop(err: Error) {
    releaseStream();
    phase.value = 'idle';
    elapsedSec.value = 0;
    stopReject?.(err);
    stopResolve = null;
    stopReject = null;
  }

  async function start(): Promise<void> {
    error.value = '';
    if (!uiAvailable) {
      error.value = 'Запись недоступна в этом браузере';
      return;
    }
    if (!mp4Available || !mimeType) {
      error.value =
        'Этот браузер не умеет записывать MP4 (H.264). На Linux так бывает — попробуйте Chrome на Windows/macOS или загрузите файл вручную.';
      return;
    }
    if (phase.value !== 'idle') return;

    try {
      const media = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      stream = media;
      chunks = [];
      stopInterrupted = false;

      const rec = new MediaRecorder(media, { mimeType });
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
        releaseStream();
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

      const videoTrack = media.getVideoTracks()[0];
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
      releaseStream();
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
      if (recorder.state !== 'inactive') {
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
    releaseStream();
    phase.value = 'idle';
  });

  return {
    phase,
    error,
    elapsedSec,
    formattedTime,
    uiAvailable,
    supported,
    mp4Available,
    mimeType,
    start,
    stop,
  };
}
