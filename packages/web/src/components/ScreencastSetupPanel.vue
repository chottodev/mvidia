<script setup lang="ts">
import { computed, ref, watch, nextTick, toRef } from 'vue';
import { bindVideoPreview } from '../lib/bindVideoPreview';
import { canRecordWebmAudio } from '../lib/recorderMime';
import { loadScreencastPrefs, saveScreencastPrefs } from '../lib/screencastPrefs';
import { useMicLevel } from '../composables/useMicLevel';
import { useWebcamPreview } from '../composables/useWebcamPreview';

const props = defineProps<{
  locked: boolean;
}>();

const lockedRef = toRef(props, 'locked');
const webcam = useWebcamPreview(lockedRef);
const mic = useMicLevel(lockedRef);

const {
  enabled: webcamEnabled,
  deviceId: webcamDeviceId,
  stream: webcamStream,
  ready: webcamReady,
  error: webcamError,
  devices: webcamDevices,
} = webcam;

const {
  enabled: micEnabled,
  deviceId: micDeviceId,
  stream: micStream,
  ready: micReady,
  level: micLevel,
  error: micError,
  devices: micDevices,
} = mic;

const micAudioSupported = canRecordWebmAudio();
const prefs = loadScreencastPrefs();
const systemAudioEnabled = ref(prefs.useSystemAudio);
const previewVideoEl = ref<HTMLVideoElement | null>(null);

watch(systemAudioEnabled, (v) => {
  saveScreencastPrefs({ useSystemAudio: v });
});

const showWebcamPreview = computed(() => webcamEnabled.value && webcamReady.value && webcamStream.value);

const isSetupReady = computed(() => {
  if (props.locked) return false;
  if (webcamEnabled.value && !webcamReady.value) return false;
  if (micEnabled.value && !micReady.value) return false;
  return true;
});

/** Поток часто готов раньше, чем <video> появится в DOM (v-if) — без nextTick превью остаётся чёрным. */
async function syncWebcamPreview() {
  await nextTick();
  if (!showWebcamPreview.value) {
    if (previewVideoEl.value) previewVideoEl.value.srcObject = null;
    return;
  }
  await bindVideoPreview(previewVideoEl.value, webcamStream.value);
}

watch([webcamStream, previewVideoEl, showWebcamPreview], () => {
  void syncWebcamPreview();
}, { flush: 'post', immediate: true });

defineExpose({
  webcamEnabled,
  webcamReady,
  webcamStream,
  micEnabled,
  micReady,
  micStream,
  systemAudioEnabled,
  isSetupReady,
});
</script>

<template>
  <section class="setup" :class="{ locked }">
    <h2 class="setup-title">Перед записью</h2>
    <p class="setup-hint">
      Экран — всегда основа. Включите камеру и/или микрофон, проверьте устройства. Для микрофона удобны
      наушники, чтобы не было эха.
    </p>

    <div class="option">
      <label class="check">
        <input v-model="webcamEnabled" type="checkbox" :disabled="locked" />
        <span>Запись вебкамеры</span>
      </label>
      <template v-if="webcamEnabled">
        <label class="select-row">
          <span>Камера</span>
          <select v-model="webcamDeviceId" :disabled="locked || !webcamDevices.length">
            <option v-if="!webcamDevices.length" value="">Нет устройств</option>
            <option v-for="d in webcamDevices" :key="d.deviceId" :value="d.deviceId">
              {{ d.label }}
            </option>
          </select>
        </label>
        <div v-if="showWebcamPreview" class="preview-wrap">
          <video ref="previewVideoEl" class="preview-video mirror" muted playsinline autoplay />
        </div>
        <p v-if="webcamError" class="opt-err">{{ webcamError }}</p>
      </template>
    </div>

    <div class="option">
      <label class="check" :class="{ disabled: !micAudioSupported }">
        <input v-model="micEnabled" type="checkbox" :disabled="locked || !micAudioSupported" />
        <span>Запись микрофона</span>
      </label>
      <p v-if="!micAudioSupported" class="opt-warn">
        В этом браузере нельзя записать звук в WebM — опция недоступна.
      </p>
      <template v-else-if="micEnabled">
        <label class="select-row">
          <span>Микрофон</span>
          <select v-model="micDeviceId" :disabled="locked || !micDevices.length">
            <option v-if="!micDevices.length" value="">Нет устройств</option>
            <option v-for="d in micDevices" :key="d.deviceId" :value="d.deviceId">
              {{ d.label }}
            </option>
          </select>
        </label>
        <div v-if="micReady" class="meter-wrap">
          <div class="meter-track">
            <div class="meter-fill" :style="{ width: `${Math.round(micLevel * 100)}%` }" />
          </div>
          <span class="meter-label">Уровень микрофона</span>
        </div>
        <p v-if="micError" class="opt-err">{{ micError }}</p>
      </template>
    </div>

    <div class="option">
      <label class="check" :class="{ disabled: !micAudioSupported }">
        <input v-model="systemAudioEnabled" type="checkbox" :disabled="locked || !micAudioSupported" />
        <span>Звук компьютера / вкладки</span>
      </label>
      <p class="opt-hint">
        При записи в диалоге Chrome отметьте «Поделиться звуком вкладки» (или системным звуком). Если не
        отметите — запись продолжится без этой дорожки.
      </p>
    </div>
  </section>
</template>

<style scoped>
.setup {
  margin-top: 1rem;
  padding: 1rem 1.15rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.setup.locked {
  opacity: 0.85;
}
.setup-title {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
}
.setup-hint {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  color: #64748b;
  line-height: 1.45;
}
.option + .option {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #f1f5f9;
}
.check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  cursor: pointer;
}
.check.disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.select-row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.65rem;
  font-size: 0.9rem;
}
.select-row select {
  padding: 0.45rem 0.55rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  max-width: 100%;
}
.preview-wrap {
  margin-top: 0.75rem;
}
.preview-video {
  width: 100%;
  max-width: 280px;
  border-radius: 8px;
  background: #0f172a;
  display: block;
}
.preview-video.mirror {
  transform: scaleX(-1);
}
.meter-wrap {
  margin-top: 0.65rem;
}
.meter-track {
  height: 10px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
}
.meter-fill {
  height: 100%;
  background: #22c55e;
  transition: width 80ms linear;
}
.meter-label {
  display: block;
  margin-top: 0.35rem;
  font-size: 0.8rem;
  color: #64748b;
}
.opt-err {
  margin: 0.5rem 0 0;
  color: #b91c1c;
  font-size: 0.9rem;
}
.opt-warn {
  margin: 0.35rem 0 0;
  color: #b45309;
  font-size: 0.85rem;
}
.opt-hint {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: #64748b;
  line-height: 1.4;
}
</style>
