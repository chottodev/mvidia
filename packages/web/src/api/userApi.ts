import { logUi } from '../log';

const useProxy = import.meta.env.DEV && !import.meta.env.VITE_API_USER_BASE_URL;

export type VideoStatus = 'not_ready' | 'ready' | 'failed';

export type ProcessingStep = 'uploaded' | 'queued' | 'converting' | 'finalizing';

export type VideoMeta = {
  publicId: string;
  title: string;
  status: VideoStatus;
  processingStep?: ProcessingStep;
  errorMessage?: string;
  mimeType?: string;
  sizeBytes: number | null;
  sourceSizeBytes?: number;
  createdAt: string;
};

export function userApiBase(): string {
  if (useProxy) return '/__proxy_user_api';
  const fromEnv = import.meta.env.VITE_API_USER_BASE_URL;
  if (fromEnv != null && String(fromEnv).length > 0) {
    return String(fromEnv).replace(/\/$/, '');
  }
  if (import.meta.env.PROD) return '';
  return 'http://127.0.0.1:3001';
}

export function publicSiteBase(): string {
  return (import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, '');
}

export function watchPageUrl(publicId: string): string {
  return `${publicSiteBase()}/v/${encodeURIComponent(publicId)}`;
}

export async function uploadVideo(file: File, title: string) {
  logUi('upload', 'отправка на сервер', {
    title,
    fileName: file.name,
    sizeBytes: file.size,
    mimeType: file.type,
  });
  const fd = new FormData();
  fd.append('file', file);
  fd.append('title', title);
  const res = await fetch(`${userApiBase()}/videos`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) {
    let msg = `Ошибка ${res.status}`;
    try {
      const j = await res.json();
      if (j.message) msg = j.message;
    } catch {
      /* ignore */
    }
    logUi('upload', 'ошибка', { status: res.status, message: msg });
    throw new Error(msg);
  }
  const body = (await res.json()) as {
    publicId: string;
    title: string;
    status: VideoStatus;
    processingStep?: ProcessingStep;
    sourceSizeBytes: number;
  };
  logUi('upload', 'принято сервером', {
    publicId: body.publicId,
    status: body.status,
    processingStep: body.processingStep,
  });
  return body;
}

export type GetVideoMetaOptions = { poll?: boolean };

export async function getVideoMeta(
  publicId: string,
  opts?: GetVideoMetaOptions
): Promise<VideoMeta> {
  const poll = opts?.poll === true;
  const headers: HeadersInit = poll ? { 'X-Mvidia-Poll': '1' } : {};
  const res = await fetch(`${userApiBase()}/videos/${encodeURIComponent(publicId)}`, {
    headers,
  });
  if (!res.ok) {
    logUi('watch', 'метаданные: не найдено', { publicId, poll });
    throw new Error('Видео не найдено');
  }
  const meta = (await res.json()) as VideoMeta;
  if (poll) {
    logUi('watch', 'poll', {
      publicId,
      status: meta.status,
      processingStep: meta.processingStep,
    });
  } else {
    logUi('watch', 'метаданные загружены', {
      publicId,
      status: meta.status,
      processingStep: meta.processingStep,
    });
  }
  return meta;
}

export function videoFileUrl(publicId: string): string {
  return `${userApiBase()}/videos/${encodeURIComponent(publicId)}/file`;
}
