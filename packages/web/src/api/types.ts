export type VideoStatus = 'not_ready' | 'ready' | 'failed';

export type ProcessingStep = 'uploaded' | 'queued' | 'converting' | 'finalizing';

export type VideoVisibility = 'public' | 'private';

export type VideoMeta = {
  publicId: string;
  title: string;
  description?: string;
  visibility: VideoVisibility;
  status: VideoStatus;
  processingStep?: ProcessingStep;
  errorMessage?: string;
  mimeType?: string;
  sizeBytes: number | null;
  sourceSizeBytes?: number;
  createdAt: string;
  authorName?: string;
  canEdit?: boolean;
};

export type VideoHidden = {
  publicId: string;
  visibility: 'private';
  hidden: true;
  message: string;
};

export type VideoMetaResponse = VideoMeta | VideoHidden;

export function isVideoHidden(v: VideoMetaResponse): v is VideoHidden {
  return 'hidden' in v && v.hidden === true;
}

export type VideoPatch = {
  title?: string;
  description?: string;
  visibility?: VideoVisibility;
};
