const MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.42E01E, mp4a.40.2"',
  'video/mp4;codecs=avc1',
  'video/mp4',
] as const;

export function pickRecorderMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

/** Chromium на desktop (Chrome, Edge, встроенные Chromium-браузеры). */
export function isChromiumDesktop(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return false;
  if (/Firefox\//.test(ua)) return false;
  const w = window as Window & { chrome?: unknown };
  return (
    !!w.chrome ||
    /Chrome\//.test(ua) ||
    /Chromium\//.test(ua) ||
    /Edg\//.test(ua)
  );
}

export function hasDisplayCapture(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
}

export function canRecordMp4(): boolean {
  const mime = pickRecorderMimeType();
  return mime != null && mime.includes('mp4');
}

/** Можно открыть UI записи (Chromium + захват экрана). */
export function isRecordingUiAvailable(): boolean {
  return isChromiumDesktop() && hasDisplayCapture() && typeof MediaRecorder !== 'undefined';
}

/** Можно реально начать запись под наш API (нужен MP4/H.264). */
export function isRecordingSupported(): boolean {
  return isRecordingUiAvailable() && canRecordMp4();
}
