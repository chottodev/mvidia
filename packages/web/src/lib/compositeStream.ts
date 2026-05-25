const PIP_WIDTH_RATIO = 0.22;
const PIP_MARGIN = 16;
const PIP_RADIUS = 8;
/** Стабильный FPS для MediaRecorder; отрисовку не гоним быстрее */
const COMPOSITE_FPS = 24;
const MIN_FRAME_MS = Math.round(1000 / COMPOSITE_FPS);
/** Выше — частые фризы на canvas при PiP (4K экран) */
const MAX_CANVAS_W = 1920;
const MAX_CANVAS_H = 1080;

export type CompositeStreamHandle = {
  stream: MediaStream;
  ready: Promise<void>;
  stop: () => void;
};

export function cloneWebcamForComposite(webcamStream: MediaStream): MediaStream | null {
  const track = webcamStream.getVideoTracks()[0];
  if (!track) return null;
  return new MediaStream([track.clone()]);
}

function waitVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Не удалось загрузить видео для композита'));
  });
}

function keepVideoPlaying(video: HTMLVideoElement) {
  if (video.paused) {
    void video.play().catch(() => {});
  }
}

/** Вписать исходный кадр в лимит 1080p — меньше нагрузка, меньше фризов */
function fitCanvasSize(sourceW: number, sourceH: number): { w: number; h: number } {
  if (sourceW <= 0 || sourceH <= 0) {
    return { w: MAX_CANVAS_W, h: MAX_CANVAS_H };
  }
  let w = sourceW;
  let h = sourceH;
  if (w > MAX_CANVAS_W) {
    h = Math.round((h * MAX_CANVAS_W) / w);
    w = MAX_CANVAS_W;
  }
  if (h > MAX_CANVAS_H) {
    w = Math.round((w * MAX_CANVAS_H) / h);
    h = MAX_CANVAS_H;
  }
  return { w, h };
}

function drawRoundedVideo(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();
  ctx.drawImage(video, x, y, w, h);
  ctx.restore();
}

function createPipelineHost(): HTMLDivElement {
  const host = document.createElement('div');
  host.setAttribute('data-mvidia', 'screencast-pipeline');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
  document.body.appendChild(host);
  return host;
}

export function createCompositeStream(options: {
  screenStream: MediaStream;
  webcamStream?: MediaStream | null;
  micStream?: MediaStream | null;
}): CompositeStreamHandle {
  const { screenStream, webcamStream, micStream } = options;
  const webcamTrack = webcamStream?.getVideoTracks()[0];

  if (!webcamTrack) {
    const out = new MediaStream();
    const screenVideo = screenStream.getVideoTracks()[0];
    if (screenVideo) out.addTrack(screenVideo);
    const micAudio = micStream?.getAudioTracks()[0];
    if (micAudio) out.addTrack(micAudio);
    return {
      stream: out,
      ready: Promise.resolve(),
      stop: () => {},
    };
  }

  const host = createPipelineHost();

  const screenVideo = document.createElement('video');
  screenVideo.muted = true;
  screenVideo.playsInline = true;
  screenVideo.setAttribute('playsinline', '');
  screenVideo.srcObject = screenStream;

  const webcamVideo = document.createElement('video');
  webcamVideo.muted = true;
  webcamVideo.playsInline = true;
  webcamVideo.setAttribute('playsinline', '');
  webcamVideo.srcObject = webcamStream!;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
  } as CanvasRenderingContext2DSettings);
  if (!ctx) {
    host.remove();
    throw new Error('Canvas 2D недоступен');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';

  host.append(screenVideo, webcamVideo, canvas);

  let running = false;
  let drawTimerId = 0;
  let rvfcId = 0;
  let lastDrawMs = 0;
  let canvasW = 0;
  let canvasH = 0;

  const outStream = canvas.captureStream(COMPOSITE_FPS);
  const micAudio = micStream?.getAudioTracks()[0];
  if (micAudio) {
    outStream.addTrack(micAudio);
  }

  function resizeCanvasIfNeeded() {
    const sw = screenVideo.videoWidth;
    const sh = screenVideo.videoHeight;
    if (sw <= 0 || sh <= 0) return;
    const { w, h } = fitCanvasSize(sw, sh);
    if (w !== canvasW || h !== canvasH) {
      canvasW = w;
      canvasH = h;
      canvas.width = w;
      canvas.height = h;
    }
  }

  function drawFrameSync() {
    if (!running) return;
    const now = performance.now();
    if (now - lastDrawMs < MIN_FRAME_MS) return;
    lastDrawMs = now;

    keepVideoPlaying(screenVideo);
    keepVideoPlaying(webcamVideo);
    if (screenVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    resizeCanvasIfNeeded();
    if (canvasW <= 0 || canvasH <= 0) return;

    ctx.drawImage(screenVideo, 0, 0, canvasW, canvasH);

    if (webcamVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const pipW = canvasW * PIP_WIDTH_RATIO;
      const aspect =
        webcamVideo.videoWidth > 0 ? webcamVideo.videoHeight / webcamVideo.videoWidth : 9 / 16;
      const pipH = pipW * aspect;
      const x = canvasW - pipW - PIP_MARGIN;
      const y = canvasH - pipH - PIP_MARGIN;
      drawRoundedVideo(ctx, webcamVideo, x, y, pipW, pipH, PIP_RADIUS);
    }
  }

  const scheduleNextFrame = () => {
    if (!running) return;
    if (typeof screenVideo.requestVideoFrameCallback === 'function') {
      rvfcId = screenVideo.requestVideoFrameCallback(() => {
        drawFrameSync();
        scheduleNextFrame();
      });
    }
  };

  const ready = (async () => {
    await screenVideo.play();
    await waitVideoReady(screenVideo);
    await webcamVideo.play();
    await waitVideoReady(webcamVideo);
    resizeCanvasIfNeeded();
    drawFrameSync();
    running = true;

    if (typeof screenVideo.requestVideoFrameCallback === 'function') {
      scheduleNextFrame();
    } else {
      drawTimerId = window.setInterval(drawFrameSync, MIN_FRAME_MS);
    }
  })();

  return {
    stream: outStream,
    ready,
    stop: () => {
      running = false;
      clearInterval(drawTimerId);
      if (typeof screenVideo.cancelVideoFrameCallback === 'function' && rvfcId) {
        screenVideo.cancelVideoFrameCallback(rvfcId);
      }
      outStream.getTracks().forEach((t) => t.stop());
      screenVideo.srcObject = null;
      webcamVideo.srcObject = null;
      host.remove();
    },
  };
}
