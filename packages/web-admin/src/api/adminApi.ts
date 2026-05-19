const STORAGE = 'mvidia_admin_auth_v1';

export type AdminAuth = { user: string; pass: string };

const useProxy = import.meta.env.DEV && !import.meta.env.VITE_API_ADMIN_BASE_URL;

export function adminApiBase(): string {
  if (useProxy) return '/__proxy_admin_api';
  const fromEnv = import.meta.env.VITE_API_ADMIN_BASE_URL;
  if (fromEnv != null && String(fromEnv).length > 0) {
    return String(fromEnv).replace(/\/$/, '');
  }
  if (import.meta.env.PROD) return '';
  return 'http://127.0.0.1:3002';
}

export function loadAuth(): AdminAuth | null {
  try {
    const raw = sessionStorage.getItem(STORAGE);
    if (!raw) return null;
    return JSON.parse(raw) as AdminAuth;
  } catch {
    return null;
  }
}

export function saveAuth(a: AdminAuth) {
  sessionStorage.setItem(STORAGE, JSON.stringify(a));
}

export function clearAuth() {
  sessionStorage.removeItem(STORAGE);
}

function authHeader(a: AdminAuth): HeadersInit {
  const token = btoa(`${a.user}:${a.pass}`);
  return { Authorization: `Basic ${token}` };
}

export type VideoRow = {
  publicId: string;
  title: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
};

export async function listVideos(a: AdminAuth, offset: number, limit: number) {
  const q = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  const res = await fetch(`${adminApiBase()}/videos?${q}`, { headers: authHeader(a) });
  if (res.status === 401) throw new Error('Неверный логин или пароль');
  if (!res.ok) throw new Error(`Ошибка ${res.status}`);
  return res.json() as Promise<{ total: number; items: VideoRow[] }>;
}

export async function deleteVideo(a: AdminAuth, publicId: string) {
  const res = await fetch(`${adminApiBase()}/videos/${encodeURIComponent(publicId)}`, {
    method: 'DELETE',
    headers: authHeader(a),
  });
  if (res.status === 401) throw new Error('Неверный логин или пароль');
  if (res.status === 404) return;
  if (!res.ok) throw new Error(`Ошибка ${res.status}`);
}
