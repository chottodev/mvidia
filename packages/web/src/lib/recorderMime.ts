const MIME_WITH_AUDIO = [
  'video/mp4;codecs="avc1.42E01E, mp4a.40.2"',
  'video/mp4;codecs="avc1, mp4a.40.2"',
  'video/mp4',
] as const;

const MIME_VIDEO_ONLY = [
  'video/mp4;codecs="avc1.42E01E"',
  'video/mp4;codecs=avc1',
  'video/mp4',
] as const;

export function pickRecorderMimeType(options?: { withAudio?: boolean }): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const list = options?.withAudio ? MIME_WITH_AUDIO : MIME_VIDEO_ONLY;
  for (const mime of list) {
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

export function canRecordMp4Video(): boolean {
  const mime = pickRecorderMimeType({ withAudio: false });
  return mime != null && mime.includes('mp4');
}

export function canRecordMp4WithAudio(): boolean {
  const mime = pickRecorderMimeType({ withAudio: true });
  return mime != null && mime.includes('mp4');
}

/** @deprecated use canRecordMp4Video */
export function canRecordMp4(): boolean {
  return canRecordMp4Video();
}

export function isRecordingUiAvailable(): boolean {
  return isChromiumDesktop() && hasDisplayCapture() && typeof MediaRecorder !== 'undefined';
}

export function isRecordingSupported(): boolean {
  return isRecordingUiAvailable() && canRecordMp4Video();
}
