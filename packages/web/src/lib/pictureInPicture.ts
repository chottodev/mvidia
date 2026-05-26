export const LIVE_WEBCAM_PIP_WIDTH = 320;
export const LIVE_WEBCAM_PIP_HEIGHT = 180;

export function isDocumentPictureInPictureSupported(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}
