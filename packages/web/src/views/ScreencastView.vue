<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { bindVideoPreview } from '../lib/bindVideoPreview';
import { useRouter } from 'vue-router';
import ScreencastSetupPanel from '../components/ScreencastSetupPanel.vue';
import { publicSiteBase } from '../api/userApi';
import { useLiveWebcamPip } from '../composables/useLiveWebcamPip';
import { useScreencastStreamRecorder } from '../composables/useScreencastStreamRecorder';
import { makeScreencastTitle } from '../lib/screencastTitle';
import { isRecordingSecureContext } from '../lib/secureContext';

const router = useRouter();
const setupPanel = ref<InstanceType<typeof ScreencastSetupPanel> | null>(null);
const recordingPreviewEl = ref<HTMLVideoElement | null>(null);

const {
  phase,
  error: recorderError,
  warning: recorderWarning,
  formattedTime,
  uiAvailable,
  webmVideoAvailable,
  start,
  stop,
} = useScreencastStreamRecorder();

const liveWebcamPip = useLiveWebcamPip();

const pageError = ref('');
const lastLink = ref('');
const lastPublicId = ref('');

const secureContext = isRecordingSecureContext();
const setupLocked = computed(() => phase.value !== 'idle');

const canStart = computed(() => {
  if (!uiAvailable || !webmVideoAvailable || !secureContext) return false;
  return setupPanel.value?.isSetupReady ?? false;
});

const showRecordingWebcamPreview = computed(
  () =>
    phase.value === 'recording' &&
    setupPanel.value?.webcamEnabled &&
    setupPanel.value?.webcamReady &&
    setupPanel.value?.webcamStream &&
    !setupPanel.value?.livePipDuringRecording
);

async function syncRecordingWebcamPreview() {
  await nextTick();
  if (!showRecordingWebcamPreview.value) {
    if (recordingPreviewEl.value) recordingPreviewEl.value.srcObject = null;
    return;
  }
  await bindVideoPreview(recordingPreviewEl.value, setupPanel.value?.webcamStream ?? null);
}

watch([showRecordingWebcamPreview, recordingPreviewEl], () => {
  void syncRecordingWebcamPreview();
}, { flush: 'post' });

async function onStart() {
  pageError.value = '';
  lastLink.value = '';
  lastPublicId.value = '';
  const panel = setupPanel.value;
  if (!panel) return;

  await start({
    title: makeScreencastTitle(),
    useWebcam: panel.webcamEnabled,
    useMic: panel.micEnabled,
    useSystemAudio: panel.systemAudioEnabled,
    webcamStream: panel.webcamStream,
    micStream: panel.micStream,
  });

  if (
    panel.webcamEnabled &&
    panel.livePipDuringRecording &&
    panel.webcamStream
  ) {
    try {
      await liveWebcamPip.open(panel.webcamStream);
    } catch (e) {
      recorderWarning.value =
        e instanceof Error
          ? `Не удалось открыть PiP: ${e.message}`
          : 'Не удалось открыть окно камеры';
    }
  }
}

async function onStop() {
  pageError.value = '';
  liveWebcamPip.close();
  try {
    const publicId = await stop();
    lastPublicId.value = publicId;
    lastLink.value = `${publicSiteBase()}/v/${publicId}`;
  } catch (e) {
    pageError.value = e instanceof Error ? e.message : 'Не удалось завершить запись';
  }
}

function goWatch() {
  if (lastPublicId.value) {
    router.push({ name: 'watch', params: { publicId: lastPublicId.value } });
  }
}

async function copyLink() {
  if (!lastLink.value) return;
  try {
    await navigator.clipboard.writeText(lastLink.value);
  } catch {
    pageError.value = 'Не удалось скопировать ссылку';
  }
}

function resetResult() {
  lastLink.value = '';
  lastPublicId.value = '';
  pageError.value = '';
  recorderError.value = '';
}
</script>

<template>
  <h1>Скринкаст</h1>

  <template v-if="!uiAvailable">
    <p class="warn">
      Запись экрана доступна только в <strong>Google Chrome</strong> или <strong>Microsoft Edge</strong> на
      компьютере. Загрузите готовый MP4 на
      <RouterLink to="/">странице загрузки</RouterLink>.
    </p>
  </template>

  <template v-else>
    <p class="hint">
      Запись экрана с потоковой отправкой на сервер. Опционально: вебкамера (PiP), микрофон, звук вкладки/системы.
      После остановки сервер собирает MP4 (H.264). Chrome или Edge; HTTPS, localhost или 127.0.0.1.
    </p>
    <p v-if="!webmVideoAvailable" class="warn">
      В этом браузере нет записи WebM — обновите Chrome/Edge.
    </p>
    <p v-if="!secureContext" class="warn">
      Откройте сайт по <strong>https://</strong>, <strong>http://localhost</strong> или
      <strong>http://127.0.0.1</strong>.
    </p>

    <ScreencastSetupPanel ref="setupPanel" :locked="setupLocked" />

    <div v-if="phase === 'idle' && !lastLink" class="panel">
      <button type="button" class="primary" :disabled="!canStart" @click="onStart">
        Начать запись
      </button>
      <p v-if="!canStart" class="panel-hint">
        Разрешите доступ к включённым устройствам или отключите опцию.
      </p>
    </div>

    <div v-else-if="phase === 'recording'" class="panel recording">
      <div class="recording-row">
        <div>
          <p class="status">
            Идёт запись <span class="timer">{{ formattedTime }}</span>
          </p>
          <p class="stream-hint">Данные отправляются на сервер по мере записи.</p>
          <button type="button" class="danger" @click="onStop">Стоп запись</button>
        </div>
        <video
          v-if="showRecordingWebcamPreview"
          ref="recordingPreviewEl"
          class="recording-preview mirror"
          muted
          playsinline
          autoplay
        />
      </div>
    </div>

    <div v-else-if="phase === 'stopping' || phase === 'processing'" class="panel">
      <p class="status">
        {{
          phase === 'stopping'
            ? 'Завершение записи и загрузка последних фрагментов…'
            : 'Обработка на сервере (сборка MP4)…'
        }}
      </p>
    </div>

    <p v-if="recorderWarning" class="warn">{{ recorderWarning }}</p>
    <p v-if="recorderError" class="err">{{ recorderError }}</p>
    <p v-if="pageError" class="err">{{ pageError }}</p>

    <section v-if="lastLink" class="result">
      <h2>Готово</h2>
      <p>
        <a :href="lastLink">{{ lastLink }}</a>
      </p>
      <div class="row">
        <button type="button" @click="copyLink">Копировать ссылку</button>
        <button type="button" class="dark" @click="goWatch">Открыть плеер</button>
        <button type="button" class="secondary" @click="resetResult">Новая запись</button>
      </div>
    </section>
  </template>
</template>

<style scoped>
.hint {
  color: #64748b;
}
.warn {
  color: #b45309;
  margin-top: 1rem;
  line-height: 1.5;
}
.warn a {
  color: #2563eb;
}
.panel {
  margin-top: 1.25rem;
  padding: 1.25rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.panel-hint {
  margin: 0.75rem 0 0;
  font-size: 0.9rem;
  color: #64748b;
}
.stream-hint {
  margin: 0 0 1rem;
  font-size: 0.85rem;
  color: #64748b;
}
.recording-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-start;
}
.recording .status {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
}
.recording-preview {
  width: 160px;
  height: 90px;
  object-fit: cover;
  border-radius: 8px;
  background: #0f172a;
}
.recording-preview.mirror {
  transform: scaleX(-1);
}
.timer {
  font-variant-numeric: tabular-nums;
  color: #dc2626;
}
button {
  padding: 0.55rem 1rem;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-weight: 600;
}
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.primary {
  background: #2563eb;
  color: #fff;
}
.danger {
  background: #dc2626;
  color: #fff;
}
.dark {
  background: #0f172a;
  color: #fff;
}
.secondary {
  background: #e2e8f0;
  color: #0f172a;
}
.err {
  color: #b91c1c;
  margin-top: 1rem;
}
.result {
  margin-top: 2rem;
  padding: 1rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 0.75rem;
}
</style>
