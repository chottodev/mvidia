const useProxy = import.meta.env.DEV && !import.meta.env.VITE_API_USER_BASE_URL;

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
    sizeBytes: number;
    mimeType: string;
  }>;
}

export async function getVideoMeta(publicId: string) {
  const res = await fetch(`${userApiBase()}/videos/${encodeURIComponent(publicId)}`);
  if (!res.ok) {
    throw new Error('Видео не найдено');
  }
  return res.json() as Promise<{
    publicId: string;
    title: string;
    sizeBytes: number;
    mimeType: string;
    createdAt: string;
  }>;
}

export function videoFileUrl(publicId: string): string {
  return `${userApiBase()}/videos/${encodeURIComponent(publicId)}/file`;
}
