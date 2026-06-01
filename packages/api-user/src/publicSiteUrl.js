/** Публичный URL user-сайта (ссылки, Open Graph). Задаётся в .env при деплое. */
function resolvePublicSiteUrlFromEnv() {
  const fromEnv = process.env.USER_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL;
  if (fromEnv) return String(fromEnv).replace(/\/$/, '');
  return '';
}

module.exports = { resolvePublicSiteUrlFromEnv };
