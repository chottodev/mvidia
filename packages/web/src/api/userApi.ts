import { bearerHeaders } from './authApi';
import { publicSiteBase, userApiBase } from './base';
import { logUi } from '../log';

export { userApiBase, publicSiteBase };

import type {
  VideoMeta,
  VideoMetaResponse,
  VideoPatch,
  VideoStatus,
  ProcessingStep,
  VideoVisibility,
} from './types';
import { isVideoHidden } from './types';
export type {
  VideoMeta,
  VideoHidden,
  VideoMetaResponse,
  VideoPatch,
  VideoStatus,
  ProcessingStep,
  VideoVisibility,
} from './types';
export { isVideoHidden } from './types';

export function watchPageUrl(publicId: string): string {
  return `${publicSiteBase()}/v/${encodeURIComponent(publicId)}`;
}

export type UploadVideoOpts = {
  description?: string;
  visibility?: VideoVisibility;
};

export async function uploadVideo(file: File, title: string, opts?: UploadVideoOpts) {
  logUi('upload', 'отправка на сервер', {
    title,
    fileName: file.name,
    sizeBytes: file.size,
    mimeType: file.type,
    visibility: opts?.visibility,
  });
  const fd = new FormData();
  fd.append('file', file);
  fd.append('title', title);
  if (opts?.description) fd.append('description', opts.description);
  if (opts?.visibility) fd.append('visibility', opts.visibility);
  const res = await fetch(`${userApiBase()}/videos`, {
    method: 'POST',
    headers: bearerHeaders(),
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
    logUi('upload', 'ошибка', { status: res.status, message: msg });
    throw new Error(msg);
  }
  const body = await res.json();
  logUi('upload', 'принято сервером', {
    publicId: body.publicId,
    status: body.status,
    visibility: body.visibility,
  });
  return body as {
    publicId: string;
    title: string;
    description?: string;
    visibility: VideoVisibility;
    status: VideoStatus;
    processingStep?: ProcessingStep;
    sourceSizeBytes: number;
  };
}

export type GetVideoMetaOptions = { poll?: boolean };

export async function getVideoMeta(
  publicId: string,
  opts?: GetVideoMetaOptions
): Promise<VideoMetaResponse> {
  const poll = opts?.poll === true;
  const headers: HeadersInit = {
    ...bearerHeaders(),
    ...(poll ? { 'X-Mvidia-Poll': '1' } : {}),
  };
  const res = await fetch(`${userApiBase()}/videos/${encodeURIComponent(publicId)}`, {
    headers,
  });
  if (!res.ok) {
    logUi('watch', 'метаданные: не найдено', { publicId, poll });
    throw new Error('Видео не найдено');
  }
  const meta = (await res.json()) as VideoMetaResponse;
  if (isVideoHidden(meta)) {
    logUi('watch', 'скрыто', { publicId, poll });
    return meta;
  }
  if (poll) {
    logUi('watch', 'poll', {
      publicId,
      status: meta.status,
      processingStep: meta.processingStep,
    });
  } else {
    logUi('watch', 'метаданные загружены', {
      publicId,
      status: meta.status,
      visibility: meta.visibility,
    });
  }
  return meta;
}

export async function patchVideo(publicId: string, patch: VideoPatch): Promise<VideoMeta> {
  const res = await fetch(`${userApiBase()}/videos/${encodeURIComponent(publicId)}`, {
    method: 'PATCH',
    headers: { ...bearerHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
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
  return res.json() as Promise<VideoMeta>;
}

export function videoFileUrl(publicId: string): string {
  return `${userApiBase()}/videos/${encodeURIComponent(publicId)}/file`;
}

/** Для private: Bearer на /file */
export async function fetchVideoBlobUrl(publicId: string): Promise<string> {
  const res = await fetch(`${userApiBase()}/videos/${encodeURIComponent(publicId)}/file`, {
    headers: bearerHeaders(),
  });
  if (!res.ok) throw new Error('Не удалось загрузить видео');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
