import { userApiBase } from './userApi';

export type RecordingTrackId = 'screen' | 'camera' | 'microphone' | 'system-audio';

export type CreateRecordingResponse = {
  sessionId: string;
  status: string;
  tracks: Record<RecordingTrackId, { chunkUrl: string }>;
  metaUrl: string;
  finalizeUrl: string;
  statusUrl: string;
};

export type RecordingSessionStatus = {
  sessionId: string;
  status: 'recording' | 'processing' | 'ready' | 'failed';
  publicId: string | null;
  videoPublicId: string | null;
  title: string;
  processingError: string | null;
  tracksPlanned: string[];
  createdAt: string;
  finalizedAt: string | null;
  readyAt: string | null;
};

export type RecordingMeta = {
  sessionStartedAt?: number;
  sessionStartedAtPerf?: number;
  tracks?: Record<
    string,
    {
      enabled?: boolean;
      startedAtPerf?: number;
      mimeType?: string;
    }
  >;
  layout?: {
    pip?: {
      corner?: string;
      widthRatio?: number;
      marginPx?: number;
    };
  };
};

function apiUrl(path: string): string {
  const base = userApiBase();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
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

export async function createRecording(
  title: string,
  tracks: RecordingTrackId[]
): Promise<CreateRecordingResponse> {
  const res = await fetch(apiUrl('/recordings'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, tracks }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function patchRecordingMeta(
  sessionId: string,
  meta: RecordingMeta
): Promise<void> {
  const res = await fetch(apiUrl(`/recordings/${encodeURIComponent(sessionId)}/meta`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function uploadTrackChunk(
  sessionId: string,
  trackId: RecordingTrackId,
  chunkIndex: number,
  blob: Blob,
  mimeType: string
): Promise<void> {
  const res = await fetch(
    apiUrl(
      `/recordings/${encodeURIComponent(sessionId)}/tracks/${encodeURIComponent(trackId)}/chunks`
    ),
    {
      method: 'POST',
      headers: {
        'Content-Type': mimeType || 'application/octet-stream',
        'X-Chunk-Index': String(chunkIndex),
      },
      body: blob,
    }
  );
  if (!res.ok && res.status !== 204) throw new Error(await parseError(res));
}

export async function finalizeRecording(sessionId: string): Promise<{
  sessionId: string;
  publicId: string;
  status: string;
  pollUrl: string;
}> {
  const res = await fetch(
    apiUrl(`/recordings/${encodeURIComponent(sessionId)}/finalize`),
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getRecordingSession(sessionId: string): Promise<RecordingSessionStatus> {
  const res = await fetch(apiUrl(`/recordings/${encodeURIComponent(sessionId)}`));
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export function pollRecordingUntilReady(
  sessionId: string,
  intervalMs = 2000,
  maxAttempts = 300
): Promise<RecordingSessionStatus> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const s = await getRecordingSession(sessionId);
        if (s.status === 'ready') {
          resolve(s);
          return;
        }
        if (s.status === 'failed') {
          reject(new Error(s.processingError || 'Обработка на сервере не удалась'));
          return;
        }
        if (attempts >= maxAttempts) {
          reject(new Error('Превышено время ожидания обработки'));
          return;
        }
        setTimeout(tick, intervalMs);
      } catch (e) {
        reject(e);
      }
    };
    void tick();
  });
}
