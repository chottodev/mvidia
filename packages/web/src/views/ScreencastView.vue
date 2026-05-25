<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { bindVideoPreview } from '../lib/bindVideoPreview';
import { useRouter } from 'vue-router';
import ScreencastSetupPanel from '../components/ScreencastSetupPanel.vue';
import { publicSiteBase, uploadVideo } from '../api/userApi';
import { useScreencastRecorder } from '../composables/useScreencastRecorder';
import { makeScreencastTitle } from '../lib/screencastTitle';
import { isRecordingSecureContext } from '../lib/secureContext';

const router = useRouter();
const setupPanel = ref<InstanceType<typeof ScreencastSetupPanel> | null>(null);
const recordingPreviewEl = ref<HTMLVideoElement | null>(null);

const {
  phase,
  error: recorderError,
  formattedTime,
  uiAvailable,
  mp4VideoAvailable,
  start,
  stop,
} = useScreencastRecorder();

const uploading = ref(false);
const preparingUpload = ref(false);
const pageError = ref('');
const lastLink = ref('');
const lastPublicId = ref('');

const secureContext = isRecordingSecureContext();
const setupLocked = computed(() => phase.value !== 'idle' || uploading.value);

const canStart = computed(() => {
  if (!uiAvailable || !mp4VideoAvailable || !secureContext) return false;
  return setupPanel.value?.isSetupReady ?? false;
});

const showRecordingWebcamPreview = computed(
  () =>
    phase.value === 'recording' &&
    setupPanel.value?.webcamEnabled &&
    setupPanel.value?.webcamReady &&
    setupPanel.value?.webcamStream
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
    useWebcam: panel.webcamEnabled,
    useMic: panel.micEnabled,
    webcamStream: panel.webcamStream,
    micStream: panel.micStream,
  });
}

async function onStop() {
  pageError.value = '';
  try {
    const rawFile = await stop();
    uploading.value = true;
    preparingUpload.value = true;
    try {
      let file = rawFile;
      try {
        const { ensureMp4FastStart } = await import('../lib/mp4FastStart');
        file = await ensureMp4FastStart(rawFile);
      } catch {
        /* если mp4box не справился — грузим как есть; плеер попробует blob-fallback */
      }
      const title = makeScreencastTitle();
      const r = await uploadVideo(file, title);
      lastPublicId.value = r.publicId;
      lastLink.value = `${publicSiteBase()}/v/${r.publicId}`;
    } catch (e) {
      pageError.value = e instanceof Error ? e.message : 'Ошибка загрузки';
    } finally {
      preparingUpload.value = false;
      uploading.value = false;
    }
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
      Запись экрана — основа. Опционально: вебкамера (PiP в углу) и микрофон. Файл — MP4 (H.264), до 1 ГБ.
      Chrome или Edge; HTTPS, localhost или 127.0.0.1.
    </p>
    <p v-if="!mp4VideoAvailable" class="warn">
      В этом браузере нет записи в MP4 (H.264) — частая ситуация на <strong>Linux</strong>. Попробуйте Chrome на
      Windows/macOS или
      <RouterLink to="/">загрузите готовый MP4</RouterLink>.
    </p>
    <p v-if="!secureContext" class="warn">
      Откройте сайт по <strong>https://</strong>, <strong>http://localhost</strong> или
      <strong>http://127.0.0.1</strong>.
    </p>

    <ScreencastSetupPanel ref="setupPanel" :locked="setupLocked" />

    <div v-if="phase === 'idle' && !uploading && !lastLink" class="panel">
      <button type="button" class="primary" :disabled="!canStart" @click="onStart">
        Начать запись
      </button>
      <p v-if="!canStart" class="panel-hint">
        Разрешите доступ к включённым устройствам или отключите опцию. Нужна поддержка MP4 в браузере.
      </p>
    </div>

    <div v-else-if="phase === 'recording'" class="panel recording">
      <div class="recording-row">
        <div>
          <p class="status">
            Идёт запись <span class="timer">{{ formattedTime }}</span>
          </p>
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

    <div v-else-if="phase === 'stopping' || uploading" class="panel">
      <p class="status">
        {{
          preparingUpload
            ? 'Подготовка MP4 для просмотра в браузере…'
            : uploading
              ? 'Загрузка на сервер…'
              : 'Завершение записи…'
        }}
      </p>
    </div>

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
.recording-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-start;
}
.recording .status {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 1rem;
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
