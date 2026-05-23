import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { listCameras, pickExistingDeviceId } from '../lib/mediaDevices';
import { loadScreencastPrefs, saveScreencastPrefs } from '../lib/screencastPrefs';

export function useWebcamPreview(locked?: Ref<boolean>) {
  const prefs = loadScreencastPrefs();
  const enabled = ref(prefs.useWebcam);
  const deviceId = ref(prefs.cameraId);
  const stream = ref<MediaStream | null>(null);
  const ready = ref(false);
  const error = ref('');
  const devices = ref<{ deviceId: string; label: string }[]>([]);

  let busy = false;

  function isLocked() {
    return locked?.value === true;
  }

  function stopTracks() {
    stream.value?.getTracks().forEach((t) => t.stop());
    stream.value = null;
    ready.value = false;
  }

  async function refreshDevices() {
    if (isLocked()) return;
    try {
      const prev = deviceId.value;
      devices.value = await listCameras();
      const next = pickExistingDeviceId(deviceId.value, devices.value);
      if (next !== prev) {
        deviceId.value = next;
      }
    } catch {
      devices.value = [];
    }
  }

  async function start() {
    if (busy || !enabled.value || isLocked()) return;
    busy = true;
    error.value = '';
    try {
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 640 },
        height: { ideal: 360 },
        facingMode: 'user',
      };
      if (deviceId.value) {
        videoConstraints.deviceId = { exact: deviceId.value };
      }
      const media = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
      stopTracks();
      stream.value = media;
      ready.value = true;
      await refreshDevices();
      const track = media.getVideoTracks()[0];
      const settings = track?.getSettings();
      if (settings?.deviceId && settings.deviceId !== deviceId.value) {
        deviceId.value = settings.deviceId;
        saveScreencastPrefs({ cameraId: deviceId.value });
      }
    } catch (e) {
      stopTracks();
      enabled.value = false;
      saveScreencastPrefs({ useWebcam: false });
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        error.value = 'Доступ к камере не предоставлен. Опция выключена.';
      } else {
        error.value = e instanceof Error ? e.message : 'Не удалось включить камеру';
      }
    } finally {
      busy = false;
    }
  }

  watch(enabled, (v) => {
    saveScreencastPrefs({ useWebcam: v });
    if (v) void start();
    else {
      error.value = '';
      stopTracks();
    }
  });

  watch(deviceId, (id, prev) => {
    saveScreencastPrefs({ cameraId: id });
    if (isLocked() || !enabled.value || !ready.value || id === prev) return;
    void start();
  });

  function onDeviceListChange() {
    void refreshDevices();
  }

  onMounted(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener('devicechange', onDeviceListChange);
    if (enabled.value) void start();
  });

  onUnmounted(() => {
    navigator.mediaDevices?.removeEventListener('devicechange', onDeviceListChange);
    stopTracks();
  });

  return {
    enabled,
    deviceId,
    stream,
    ready,
    error,
    devices,
  };
}
