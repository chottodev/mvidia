import { onUnmounted, ref } from 'vue';
import {
  isDocumentPictureInPictureSupported,
  LIVE_WEBCAM_PIP_HEIGHT,
  LIVE_WEBCAM_PIP_WIDTH,
} from '../lib/pictureInPicture';

export function useLiveWebcamPip() {
  const isOpen = ref(false);
  let pipWindow: Window | null = null;
  let pipVideo: HTMLVideoElement | null = null;
  let onPageHide: (() => void) | null = null;

  function detachWindowListeners() {
    if (pipWindow && onPageHide) {
      pipWindow.removeEventListener('pagehide', onPageHide);
    }
    onPageHide = null;
  }

  function clearVideo() {
    if (pipVideo) {
      pipVideo.srcObject = null;
      pipVideo = null;
    }
  }

  function close(): void {
    detachWindowListeners();
    clearVideo();
    try {
      pipWindow?.close();
    } catch {
      /* already closed */
    }
    pipWindow = null;
    isOpen.value = false;
  }

  async function open(stream: MediaStream): Promise<void> {
    if (!isDocumentPictureInPictureSupported()) return;
    const api = window.documentPictureInPicture;
    if (!api) return;

    close();

    const win = await api.requestWindow({
      width: LIVE_WEBCAM_PIP_WIDTH,
      height: LIVE_WEBCAM_PIP_HEIGHT,
    });
    pipWindow = win;

    const doc = win.document;
    doc.body.style.margin = '0';
    doc.body.style.overflow = 'hidden';
    doc.body.style.background = '#0f172a';

    const video = doc.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.transform = 'scaleX(-1)';
    video.srcObject = stream;
    doc.body.append(video);
    pipVideo = video;

    try {
      await video.play();
    } catch {
      /* ignore autoplay */
    }

    onPageHide = () => {
      detachWindowListeners();
      clearVideo();
      pipWindow = null;
      isOpen.value = false;
    };
    win.addEventListener('pagehide', onPageHide);

    isOpen.value = true;
  }

  onUnmounted(() => {
    close();
  });

  return {
    isOpen,
    isSupported: isDocumentPictureInPictureSupported(),
    open,
    close,
  };
}
