/** Логи UI: dev или VITE_MVIDIA_LOG=1 */
function enabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_MVIDIA_LOG === '1';
}

export function logUi(
  scope: string,
  message: string,
  fields?: Record<string, unknown>
): void {
  if (!enabled()) return;
  const payload = {
    ts: new Date().toISOString(),
    scope: `web:${scope}`,
    msg: message,
    ...fields,
  };
  // eslint-disable-next-line no-console
  console.info(JSON.stringify(payload));
}
