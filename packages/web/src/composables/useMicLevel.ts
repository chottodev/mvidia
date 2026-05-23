import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { listMicrophones, pickExistingDeviceId } from '../lib/mediaDevices';
import { canRecordMp4WithAudio } from '../lib/recorderMime';
import { loadScreencastPrefs, saveScreencastPrefs } from '../lib/screencastPrefs';

export function useMicLevel(locked?: Ref<boolean>) {
  const prefs = loadScreencastPrefs();
  const enabled = ref(prefs.useMic);
  const deviceId = ref(prefs.micId);
  const stream = ref<MediaStream | null>(null);
  const ready = ref(false);
  const level = ref(0);
  const error = ref('');
  const devices = ref<{ deviceId: string; label: string }[]>([]);

  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let rafId = 0;
  let busy = false;
  const buf = new Uint8Array(256);

  function isLocked() {
    return locked?.value === true;
  }

  function stopMeter() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    level.value = 0;
    analyser = null;
    if (audioCtx) {
      void audioCtx.close().catch(() => {});
      audioCtx = null;
    }
  }

  function stopTracks() {
    stopMeter();
    stream.value?.getTracks().forEach((t) => t.stop());
    stream.value = null;
    ready.value = false;
  }

  function tick() {
    if (!analyser) return;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i += 1) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    level.value = Math.min(1, rms * 2.5);
    rafId = requestAnimationFrame(tick);
  }

  async function refreshDevices() {
    if (isLocked()) return;
    try {
      const prev = deviceId.value;
      devices.value = await listMicrophones();
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
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      if (deviceId.value) {
        audioConstraints.deviceId = { exact: deviceId.value };
      }
      const media = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
      stopTracks();
      stream.value = media;
      ready.value = true;

      audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(media);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      tick();

      await refreshDevices();
      const track = media.getAudioTracks()[0];
      const settings = track?.getSettings();
      if (settings?.deviceId && settings.deviceId !== deviceId.value) {
        deviceId.value = settings.deviceId;
        saveScreencastPrefs({ micId: deviceId.value });
      }
    } catch (e) {
      stopTracks();
      enabled.value = false;
      saveScreencastPrefs({ useMic: false });
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        error.value = 'Доступ к микрофону не предоставлен. Опция выключена.';
      } else {
        error.value = e instanceof Error ? e.message : 'Не удалось включить микрофон';
      }
    } finally {
      busy = false;
    }
  }

  watch(enabled, (v) => {
    saveScreencastPrefs({ useMic: v });
    if (v) void start();
    else {
      error.value = '';
      stopTracks();
    }
  });

  watch(deviceId, (id, prev) => {
    saveScreencastPrefs({ micId: id });
    if (isLocked() || !enabled.value || !ready.value || id === prev) return;
    void start();
  });

  function onDeviceListChange() {
    void refreshDevices();
  }

  onMounted(() => {
    if (enabled.value && !canRecordMp4WithAudio()) {
      enabled.value = false;
      saveScreencastPrefs({ useMic: false });
    }
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
    level,
    error,
    devices,
  };
}
