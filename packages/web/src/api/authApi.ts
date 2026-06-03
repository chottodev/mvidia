import { userApiBase } from './base';
import type { VideoMeta } from './types';

export const TOKEN_STORAGE = 'mvidia_user_token_v1';
export const USER_STORAGE = 'mvidia_user_profile_v1';

export type UserProfile = {
  id: string;
  phone: string;
  name: string;
  createdAt: string;
};

export type AuthResponse = {
  token: string;
  user: UserProfile;
};

function authHeaders(): HeadersInit {
  const token = loadToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function loadToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE);
  } catch {
    return null;
  }
}

export function loadStoredUser(): UserProfile | null {
  try {
    const raw = sessionStorage.getItem(USER_STORAGE);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: UserProfile) {
  sessionStorage.setItem(TOKEN_STORAGE, token);
  sessionStorage.setItem(USER_STORAGE, JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_STORAGE);
  sessionStorage.removeItem(USER_STORAGE);
}

export function isLoggedIn(): boolean {
  return !!loadToken();
}

async function parseError(res: Response): Promise<string> {
  let msg = `Ошибка ${res.status}`;
  try {
    const j = await res.json();
    if (j.message) msg = j.message;
  } catch {
    /* ignore */
  }
  return msg;
}

export async function register(phone: string, password: string, name: string): Promise<AuthResponse> {
  const res = await fetch(`${userApiBase()}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password, name }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as AuthResponse;
  saveSession(body.token, body.user);
  return body;
}

export async function login(phone: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${userApiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as AuthResponse;
  saveSession(body.token, body.user);
  return body;
}

export async function logout(): Promise<void> {
  const token = loadToken();
  if (token) {
    await fetch(`${userApiBase()}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  clearSession();
}

export async function fetchMe(): Promise<UserProfile> {
  const res = await fetch(`${userApiBase()}/me`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  const user = (await res.json()) as UserProfile;
  const token = loadToken();
  if (token) saveSession(token, user);
  return user;
}

export async function updateName(name: string): Promise<UserProfile> {
  const res = await fetch(`${userApiBase()}/me`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const user = (await res.json()) as UserProfile;
  const token = loadToken();
  if (token) saveSession(token, user);
  return user;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(`${userApiBase()}/me/password`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export type MyVideosResponse = {
  total: number;
  items: VideoMeta[];
};

export async function listMyVideos(offset = 0, limit = 20): Promise<MyVideosResponse> {
  const q = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  const res = await fetch(`${userApiBase()}/me/videos?${q}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<MyVideosResponse>;
}

export function bearerHeaders(): HeadersInit {
  return authHeaders();
}
