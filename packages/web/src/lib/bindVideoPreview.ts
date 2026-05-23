/** Привязать MediaStream к <video>. Нужен nextTick, если элемент монтируется через v-if. */
export async function bindVideoPreview(
  el: HTMLVideoElement | null | undefined,
  stream: MediaStream | null
): Promise<void> {
  if (!el) return;
  if (el.srcObject !== stream) {
    el.srcObject = stream;
  }
  if (stream) {
    try {
      await el.play();
    } catch {
      /* autoplay для muted preview */
    }
  }
}
