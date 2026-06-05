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
  status: 'not_ready' | 'ready' | 'failed';
  processingStep?: string;
  errorMessage?: string;
  sizeBytes: number | null;
  sourceSizeBytes?: number;
  mimeType?: string;
  createdAt: string;
  authorName?: string;
  visibility?: 'public' | 'private';
};

export async function getConfig(a: AdminAuth) {
  const res = await fetch(`${adminApiBase()}/config`, { headers: authHeader(a) });
  if (res.status === 401) throw new Error('Неверный логин или пароль');
  if (!res.ok) throw new Error(`Ошибка ${res.status}`);
  return res.json() as Promise<{
    publicSiteUrl: string | null;
    userApiDocsUrl: string | null;
  }>;
}

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

export type UserRow = {
  id: string;
  phone: string;
  name: string;
  createdAt: string;
};

export type UserDetail = UserRow & { videoCount: number };

export type UserPatch = {
  name?: string;
  phone?: string;
  password?: string;
};

async function parseApiError(res: Response): Promise<string> {
  let msg = `Ошибка ${res.status}`;
  try {
    const j = await res.json();
    if (j.message) msg = j.message;
  } catch {
    /* ignore */
  }
  return msg;
}

export async function listUsers(a: AdminAuth, offset: number, limit: number) {
  const q = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  const res = await fetch(`${adminApiBase()}/users?${q}`, { headers: authHeader(a) });
  if (res.status === 401) throw new Error('Неверный логин или пароль');
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<{ total: number; items: UserRow[] }>;
}

export async function getUser(a: AdminAuth, id: string) {
  const res = await fetch(`${adminApiBase()}/users/${encodeURIComponent(id)}`, {
    headers: authHeader(a),
  });
  if (res.status === 401) throw new Error('Неверный логин или пароль');
  if (res.status === 404) throw new Error('Пользователь не найден');
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<UserDetail>;
}

export async function updateUser(a: AdminAuth, id: string, patch: UserPatch) {
  const res = await fetch(`${adminApiBase()}/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...authHeader(a), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (res.status === 401) throw new Error('Неверный логин или пароль');
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<UserRow>;
}

export async function deleteUser(a: AdminAuth, id: string) {
  const res = await fetch(`${adminApiBase()}/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(a),
  });
  if (res.status === 401) throw new Error('Неверный логин или пароль');
  if (res.status === 404) return;
  if (!res.ok) throw new Error(await parseApiError(res));
}

export type ConversionLogStatus = 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';

export type ConversionLogRow = {
  id: string;
  publicId: string;
  jobId: string | null;
  attempt: number;
  status: ConversionLogStatus;
  sourceSizeBytes: number | null;
  videoDurationSec: number | null;
  workDurationMs: number | null;
  strategy: string | null;
  usedCopy: boolean | null;
  deliverySizeBytes: number | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export async function listConversionLogs(
  a: AdminAuth,
  offset: number,
  limit: number,
  publicId?: string
) {
  const q = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (publicId?.trim()) q.set('publicId', publicId.trim());
  const res = await fetch(`${adminApiBase()}/conversion-logs?${q}`, { headers: authHeader(a) });
  if (res.status === 401) throw new Error('Неверный логин или пароль');
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<{ total: number; items: ConversionLogRow[] }>;
}

export async function cancelConversionJob(a: AdminAuth, jobId: string) {
  const res = await fetch(`${adminApiBase()}/transcode-jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
    headers: authHeader(a),
  });
  if (res.status === 401) throw new Error('Неверный логин или пароль');
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<{
    cancelled: boolean;
    jobId: string;
    publicId: string | null;
    jobState: string | null;
  }>;
}
