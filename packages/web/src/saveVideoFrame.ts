function formatFrameTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  if (h > 0) {
    return `${h}-${String(m).padStart(2, '0')}-${String(s).padStart(2, '0')}-${String(ms).padStart(3, '0')}`;
  }
  return `${m}-${String(s).padStart(2, '0')}-${String(ms).padStart(3, '0')}`;
}

function sanitizeFilenamePart(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^\p{L}\p{N}\-_]+/gu, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'frame';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Сохраняет текущий кадр `<video>` как PNG на диск пользователя. */
export async function saveVideoFrameAsPng(
  video: HTMLVideoElement,
  filenameBase: string
): Promise<void> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error('Кадр ещё не готов — подождите загрузки видео');
  }

  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    throw new Error('Не удалось определить размер кадра');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Не удалось создать изображение');
  }

  ctx.drawImage(video, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) {
    throw new Error('Не удалось сохранить кадр');
  }

  const timePart = formatFrameTime(video.currentTime);
  const filename = `${sanitizeFilenamePart(filenameBase)}-${timePart}.png`;
  downloadBlob(blob, filename);
}
