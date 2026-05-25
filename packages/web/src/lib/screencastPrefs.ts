const PREFIX = 'mvidia.screencast.';

export type ScreencastPrefs = {
  useWebcam: boolean;
  useMic: boolean;
  useSystemAudio: boolean;
  cameraId: string;
  micId: string;
};

const DEFAULTS: ScreencastPrefs = {
  useWebcam: false,
  useMic: false,
  useSystemAudio: false,
  cameraId: '',
  micId: '',
};

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(PREFIX + key);
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

function readStr(key: string, fallback: string): string {
  try {
    return localStorage.getItem(PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function loadScreencastPrefs(): ScreencastPrefs {
  return {
    useWebcam: readBool('useWebcam', DEFAULTS.useWebcam),
    useMic: readBool('useMic', DEFAULTS.useMic),
    useSystemAudio: readBool('useSystemAudio', DEFAULTS.useSystemAudio),
    cameraId: readStr('cameraId', DEFAULTS.cameraId),
    micId: readStr('micId', DEFAULTS.micId),
  };
}

export function saveScreencastPrefs(partial: Partial<ScreencastPrefs>): void {
  try {
    if (partial.useWebcam !== undefined) {
      localStorage.setItem(PREFIX + 'useWebcam', partial.useWebcam ? '1' : '0');
    }
    if (partial.useMic !== undefined) {
      localStorage.setItem(PREFIX + 'useMic', partial.useMic ? '1' : '0');
    }
    if (partial.useSystemAudio !== undefined) {
      localStorage.setItem(PREFIX + 'useSystemAudio', partial.useSystemAudio ? '1' : '0');
    }
    if (partial.cameraId !== undefined) {
      localStorage.setItem(PREFIX + 'cameraId', partial.cameraId);
    }
    if (partial.micId !== undefined) {
      localStorage.setItem(PREFIX + 'micId', partial.micId);
    }
  } catch {
    /* ignore */
  }
}
