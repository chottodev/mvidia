/** getDisplayMedia требует secure context: HTTPS или localhost / 127.0.0.1 */
export function isRecordingSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}
