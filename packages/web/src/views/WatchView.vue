<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  fetchVideoBlobUrl,
  getVideoMeta,
  isVideoHidden,
  videoFileUrl,
  watchPageUrl,
  type VideoMeta,
  type VideoHidden,
  type VideoStatus,
} from '../api/userApi';
import { formatUploadedAt } from '../formatDate';
import { logUi } from '../log';
import { saveVideoFrameAsPng } from '../saveVideoFrame';

const props = defineProps<{ publicId: string }>();

const route = useRoute();
const publicId = computed(() => (props.publicId || (route.params.publicId as string)) ?? '');

const loading = ref(true);
const err = ref('');
const meta = ref<VideoMeta | null>(null);
const hidden = ref<VideoHidden | null>(null);
const playSrc = ref('');
const playErr = ref('');
const copyErr = ref('');
const copied = ref(false);
const videoEl = ref<HTMLVideoElement | null>(null);
const frameBusy = ref(false);
const frameErr = ref('');
const frameSaved = ref(false);
let frameSavedTimer: ReturnType<typeof setTimeout> | null = null;

const POLL_MS = 3000;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let blobUrl: string | null = null;

const pageLink = computed(() =>
  publicId.value ? watchPageUrl(publicId.value) : ''
);

const status = computed<VideoStatus | null>(() => meta.value?.status ?? null);

const copyTip = computed(() =>
  copied.value ? 'Ссылка скопирована' : 'Копировать ссылку на видео'
);

const frameTip = computed(() => {
  if (frameSaved.value) return 'Кадр сохранён';
  if (frameBusy.value) return 'Сохранение кадра…';
  return 'Сохранить текущий кадр как PNG';
});

const processingLabel = computed(() => {
  const step = meta.value?.processingStep;
  if (step === 'converting') return 'Конвертируем видео…';
  if (step === 'finalizing') return 'Завершаем обработку…';
  if (step === 'queued') return 'В очереди на обработку…';
  return 'Обрабатываем видео…';
});

function revokeBlob() {
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
    blobUrl = null;
  }
  playSrc.value = '';
}

function stopPoll() {
  if (pollTimer) {
    logUi('watch', 'остановлен poll', { publicId: publicId.value });
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPoll() {
  stopPoll();
  pollTimer = setInterval(() => {
    void load({ silent: true });
  }, POLL_MS);
}

async function setupPlayback(m: VideoMeta) {
  revokeBlob();
  playErr.value = '';
  if (m.status !== 'ready') return;
  if (m.visibility === 'private') {
    try {
      blobUrl = await fetchVideoBlobUrl(m.publicId);
      playSrc.value = blobUrl;
    } catch (e) {
      playErr.value = e instanceof Error ? e.message : 'Не удалось загрузить видео';
    }
  } else {
    playSrc.value = videoFileUrl(m.publicId);
  }
}

function onVideoError() {
  playErr.value = 'Не удалось воспроизвести видео.';
}

function clearFrameSavedTimer() {
  if (frameSavedTimer) {
    clearTimeout(frameSavedTimer);
    frameSavedTimer = null;
  }
}

async function saveFrame() {
  const video = videoEl.value;
  if (!video || !meta.value) return;
  frameErr.value = '';
  frameBusy.value = true;
  clearFrameSavedTimer();
  frameSaved.value = false;
  try {
    await saveVideoFrameAsPng(video, meta.value.title || meta.value.publicId);
    frameSaved.value = true;
    frameSavedTimer = window.setTimeout(() => {
      frameSaved.value = false;
      frameSavedTimer = null;
    }, 2000);
    logUi('watch', 'кадр сохранён', {
      publicId: meta.value.publicId,
      currentTime: video.currentTime,
    });
  } catch (e) {
    frameErr.value = e instanceof Error ? e.message : 'Не удалось сохранить кадр';
    logUi('watch', 'кадр: сбой', { message: frameErr.value });
  } finally {
    frameBusy.value = false;
  }
}

async function copyPageLink() {
  copyErr.value = '';
  copied.value = false;
  const url = pageLink.value;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    copyErr.value = 'Не удалось скопировать ссылку';
  }
}

async function load(opts?: { silent?: boolean }) {
  if (!opts?.silent) {
    loading.value = true;
    err.value = '';
    meta.value = null;
    hidden.value = null;
    revokeBlob();
    playErr.value = '';
    copyErr.value = '';
    copied.value = false;
    frameErr.value = '';
    clearFrameSavedTimer();
    frameSaved.value = false;
  }
  const prevStatus = meta.value?.status;
  const prevStep = meta.value?.processingStep;
  try {
    const m = await getVideoMeta(publicId.value, { poll: opts?.silent });
    if (isVideoHidden(m)) {
      stopPoll();
      hidden.value = m;
      meta.value = null;
      revokeBlob();
      document.title = 'Видео скрыто — mvidia';
      return;
    }
    hidden.value = null;
    meta.value = m;
    document.title = `${m.title} — mvidia`;

    if (m.status === 'not_ready') {
      revokeBlob();
      if (!pollTimer) startPoll();
    } else {
      stopPoll();
      if (m.status === 'ready') {
        const needReload =
          !opts?.silent ||
          prevStatus !== 'ready' ||
          playSrc.value === '' ||
          (m.visibility === 'private' && !blobUrl);
        if (needReload) await setupPlayback(m);
      } else {
        revokeBlob();
      }
    }
  } catch (e) {
    stopPoll();
    if (!opts?.silent) {
      err.value = e instanceof Error ? e.message : 'Ошибка';
      document.title = 'mvidia';
    }
  } finally {
    if (!opts?.silent) loading.value = false;
  }
}

onMounted(() => {
  void load();
});

onUnmounted(() => {
  stopPoll();
  revokeBlob();
  clearFrameSavedTimer();
});

watch(publicId, () => {
  stopPoll();
  void load();
});
</script>

<template>
  <div>
    <p v-if="loading">Загрузка…</p>
    <p v-else-if="err" class="err">{{ err }}</p>
    <section v-else-if="hidden" class="hidden-box">
      <h1>Видео скрыто</h1>
      <p>{{ hidden.message }}</p>
    </section>
    <template v-else-if="meta">
      <div class="title-row">
        <h1>{{ meta.title }}</h1>
        <RouterLink
          v-if="meta.canEdit"
          class="edit-btn"
          :to="{ name: 'editVideo', params: { publicId: meta.publicId } }"
          title="Редактировать"
          aria-label="Редактировать видео"
        >
          <svg class="edit-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"
            />
          </svg>
        </RouterLink>
      </div>

      <div class="media">
        <p v-if="status === 'not_ready'" class="processing">{{ processingLabel }}</p>

        <p v-else-if="status === 'failed'" class="err">
          {{ meta.errorMessage || 'Не удалось обработать видео' }}
        </p>

        <template v-else-if="status === 'ready' && playSrc">
          <video
            ref="videoEl"
            class="player"
            controls
            playsinline
            crossorigin="anonymous"
            :src="playSrc"
            @error="onVideoError"
          />
          <div class="watch-toolbar" role="toolbar" aria-label="Действия с видео">
            <button
              type="button"
              class="toolbar-btn"
              :class="{ 'is-success': copied }"
              :aria-label="copyTip"
              @click="copyPageLink"
            >
              <svg class="toolbar-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                />
              </svg>
              <span class="toolbar-tip" role="tooltip">{{ copyTip }}</span>
            </button>
            <button
              type="button"
              class="toolbar-btn"
              :class="{ 'is-success': frameSaved }"
              :disabled="frameBusy"
              :aria-label="frameTip"
              @click="saveFrame"
            >
              <svg class="toolbar-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
                />
              </svg>
              <span class="toolbar-tip" role="tooltip">{{ frameTip }}</span>
            </button>
          </div>
        </template>
        <p v-if="playErr" class="err">{{ playErr }}</p>
        <p v-if="copyErr || frameErr" class="err">{{ copyErr || frameErr }}</p>
      </div>

      <div class="below">
        <p v-if="meta.createdAt" class="uploaded-at">
          Загружено {{ formatUploadedAt(meta.createdAt) }}
        </p>
        <p v-if="meta.authorName" class="author">Автор: {{ meta.authorName }}</p>
        <p v-if="meta.visibility === 'private'" class="badge">Только вы видите это видео</p>
        <p v-if="meta.description" class="description">{{ meta.description }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hidden-box {
  padding: 1.25rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.hidden-box h1 {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
}
.title-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.title-row h1 {
  margin: 0;
  flex: 1;
  min-width: 0;
  line-height: 1.3;
}
.edit-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  margin-top: 0.15rem;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #475569;
  text-decoration: none;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.edit-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #94a3b8;
}
.edit-icon {
  display: block;
}
.media {
  margin-bottom: 1rem;
}
.watch-toolbar {
  display: inline-flex;
  gap: 0.2rem;
  margin-top: 0.5rem;
  padding: 0.2rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.toolbar-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #475569;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.toolbar-btn:hover:not(:disabled),
.toolbar-btn:focus-visible {
  background: #f1f5f9;
  color: #0f172a;
  outline: none;
}
.toolbar-btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.toolbar-btn.is-success {
  color: #15803d;
}
.toolbar-icon {
  display: block;
}
.toolbar-tip {
  position: absolute;
  bottom: calc(100% + 0.45rem);
  left: 50%;
  z-index: 2;
  transform: translateX(-50%);
  padding: 0.35rem 0.55rem;
  border-radius: 6px;
  background: #0f172a;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.25;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.toolbar-tip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #0f172a;
}
.toolbar-btn:hover .toolbar-tip,
.toolbar-btn:focus-visible .toolbar-tip {
  opacity: 1;
}
.below {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.description {
  color: #334155;
  margin: 0;
  white-space: pre-wrap;
}
.badge {
  display: inline-block;
  width: fit-content;
  font-size: 0.85rem;
  color: #64748b;
  background: #f1f5f9;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  margin: 0;
}
.uploaded-at {
  color: #64748b;
  font-size: 0.9rem;
  margin: 0;
}
.author {
  color: #475569;
  margin: 0;
}
.processing {
  color: #475569;
  margin: 0;
  padding: 2rem 0;
  text-align: center;
}
.player {
  width: 100%;
  max-height: 70vh;
  background: #000;
  border-radius: 8px;
  display: block;
}
.err {
  color: #b91c1c;
  margin: 0;
}
</style>
