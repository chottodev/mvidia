const PIP_WIDTH_RATIO = 0.22;
const PIP_MARGIN = 16;
const PIP_RADIUS = 8;
const COMPOSITE_FPS = 30;
const DRAW_INTERVAL_MS = Math.round(1000 / COMPOSITE_FPS);

export type CompositeStreamHandle = {
  stream: MediaStream;
  ready: Promise<void>;
  stop: () => void;
};

/** Отдельный video track для композита — превью в UI не делит один track с canvas. */
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

async function ensurePlaying(video: HTMLVideoElement) {
  if (!video.paused) return;
  try {
    await video.play();
  } catch {
    /* ignore */
  }
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

/**
 * Собирает итоговый поток: экран (+ PiP вебкамеры) и опционально микрофон.
 * Canvas и <video> держим в DOM — иначе Chrome может остановить кадры через ~секунды.
 */
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
      stop: () => {
        /* tracks owned by caller */
      },
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
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    host.remove();
    throw new Error('Canvas 2D недоступен');
  }

  host.append(screenVideo, webcamVideo, canvas);

  let running = false;
  let rafId = 0;
  let drawIntervalId = 0;

  const outStream = canvas.captureStream(COMPOSITE_FPS);
  const micAudio = micStream?.getAudioTracks()[0];
  if (micAudio) {
    outStream.addTrack(micAudio);
  }

  async function drawFrame() {
    if (!running) return;
    await ensurePlaying(screenVideo);
    await ensurePlaying(webcamVideo);
    if (screenVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    if (canvas.width !== screenVideo.videoWidth || canvas.height !== screenVideo.videoHeight) {
      canvas.width = screenVideo.videoWidth;
      canvas.height = screenVideo.videoHeight;
    }
    ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);

    if (webcamVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const pipW = canvas.width * PIP_WIDTH_RATIO;
      const aspect =
        webcamVideo.videoWidth > 0 ? webcamVideo.videoHeight / webcamVideo.videoWidth : 9 / 16;
      const pipH = pipW * aspect;
      const x = canvas.width - pipW - PIP_MARGIN;
      const y = canvas.height - pipH - PIP_MARGIN;
      drawRoundedVideo(ctx, webcamVideo, x, y, pipW, pipH, PIP_RADIUS);
    }
  }

  function loop() {
    void drawFrame();
    rafId = requestAnimationFrame(loop);
  }

  const ready = (async () => {
    await screenVideo.play();
    await waitVideoReady(screenVideo);
    await webcamVideo.play();
    await waitVideoReady(webcamVideo);
    canvas.width = screenVideo.videoWidth;
    canvas.height = screenVideo.videoHeight;
    await drawFrame();
    running = true;
    loop();
    drawIntervalId = window.setInterval(() => {
      void drawFrame();
    }, DRAW_INTERVAL_MS);
  })();

  return {
    stream: outStream,
    ready,
    stop: () => {
      running = false;
      cancelAnimationFrame(rafId);
      clearInterval(drawIntervalId);
      outStream.getTracks().forEach((t) => t.stop());
      screenVideo.srcObject = null;
      webcamVideo.srcObject = null;
      host.remove();
    },
  };
}
