export type VideoStatus = 'not_ready' | 'ready' | 'failed';

export type ProcessingStep = 'uploaded' | 'queued' | 'converting' | 'finalizing';

export type VideoMeta = {
  publicId: string;
  title: string;
  status: VideoStatus;
  processingStep?: ProcessingStep;
  errorMessage?: string;
  mimeType?: string;
  sizeBytes: number | null;
  sourceSizeBytes?: number;
  createdAt: string;
  authorName?: string;
};
