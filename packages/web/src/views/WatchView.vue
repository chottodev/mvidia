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
          <div class="player-actions">
            <button
              type="button"
              class="frame-btn"
              :disabled="frameBusy"
              @click="saveFrame"
            >
              {{ frameSaved ? 'Сохранено' : frameBusy ? 'Сохранение…' : 'Сохранить кадр' }}
            </button>
            <p class="frame-hint">Остановите видео на нужном моменте и нажмите кнопку.</p>
          </div>
        </template>
        <p v-if="playErr" class="err">{{ playErr }}</p>
        <p v-if="frameErr" class="err">{{ frameErr }}</p>
      </div>

      <div class="below">
        <p v-if="meta.createdAt" class="uploaded-at">
          Загружено {{ formatUploadedAt(meta.createdAt) }}
        </p>
        <p v-if="meta.authorName" class="author">Автор: {{ meta.authorName }}</p>
        <p v-if="meta.visibility === 'private'" class="badge">Только вы видите это видео</p>
        <p v-if="meta.description" class="description">{{ meta.description }}</p>

        <div v-if="status === 'ready'" class="share">
          <a class="share-link" :href="pageLink">{{ pageLink }}</a>
          <button type="button" class="copy-btn" @click="copyPageLink">
            {{ copied ? 'Скопировано' : 'Копировать ссылку' }}
          </button>
        </div>
        <p v-if="copyErr" class="err">{{ copyErr }}</p>
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
.player-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem 0.75rem;
  margin-top: 0.65rem;
}
.frame-btn {
  padding: 0.45rem 0.9rem;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #0f172a;
  font-weight: 600;
  cursor: pointer;
}
.frame-btn:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #94a3b8;
}
.frame-btn:disabled {
  opacity: 0.65;
  cursor: default;
}
.frame-hint {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
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
.share {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.25rem;
}
.share-link {
  font-size: 0.9rem;
  color: #2563eb;
  word-break: break-all;
}
.copy-btn {
  padding: 0.45rem 0.9rem;
  border-radius: 6px;
  border: none;
  background: #0f172a;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
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
