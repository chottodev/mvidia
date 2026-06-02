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
    throw new Error(msg);
  }
  return res.json() as Promise<{
    publicId: string;
    title: string;
    status: VideoStatus;
    processingStep?: ProcessingStep;
    sourceSizeBytes: number;
  }>;
}

export async function getVideoMeta(publicId: string): Promise<VideoMeta> {
  const res = await fetch(`${userApiBase()}/videos/${encodeURIComponent(publicId)}`);
  if (!res.ok) {
    throw new Error('Видео не найдено');
  }
  return res.json() as Promise<VideoMeta>;
}

export function videoFileUrl(publicId: string): string {
  return `${userApiBase()}/videos/${encodeURIComponent(publicId)}/file`;
}
