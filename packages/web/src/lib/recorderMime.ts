/** Только видео — без opus в mime (иначе start() падает на video-only stream). */
const WEBM_VIDEO_ONLY = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

const WEBM_VIDEO_WITH_AUDIO = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

const WEBM_AUDIO = ['audio/webm;codecs=opus', 'audio/webm'] as const;

function firstSupported(mimes: readonly string[]): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const mime of mimes) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

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

export function pickWebmVideoMimeType(): string | null {
  return firstSupported(WEBM_VIDEO_ONLY);
}

export function pickWebmAudioMimeType(): string | null {
  return firstSupported(WEBM_AUDIO);
}

/** Mime под реальные треки потока (главное для MediaRecorder.start). */
export function pickWebmMimeForStream(stream: MediaStream): string | null {
  const hasVideo = stream.getVideoTracks().length > 0;
  const hasAudio = stream.getAudioTracks().length > 0;
  if (!hasVideo && !hasAudio) return null;
  if (hasVideo && !hasAudio) return firstSupported(WEBM_VIDEO_ONLY);
  if (!hasVideo && hasAudio) return firstSupported(WEBM_AUDIO);
  return firstSupported(WEBM_VIDEO_WITH_AUDIO) ?? firstSupported(WEBM_VIDEO_ONLY);
}

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

export function canRecordWebmVideo(): boolean {
  return pickWebmVideoMimeType() != null;
}

export function canRecordWebmAudio(): boolean {
  return pickWebmAudioMimeType() != null;
}

/** @deprecated upload flow */
export function canRecordMp4Video(): boolean {
  const mime = pickRecorderMimeType({ withAudio: false });
  return mime != null && mime.includes('mp4');
}

/** @deprecated upload flow */
export function canRecordMp4WithAudio(): boolean {
  const mime = pickRecorderMimeType({ withAudio: true });
  return mime != null && mime.includes('mp4');
}

export function isRecordingUiAvailable(): boolean {
  return isChromiumDesktop() && hasDisplayCapture() && typeof MediaRecorder !== 'undefined';
}

export function isRecordingSupported(): boolean {
  return isRecordingUiAvailable() && canRecordWebmVideo();
}
