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
