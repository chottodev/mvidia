<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  getVideoMeta,
  videoFileUrl,
  watchPageUrl,
  type VideoMeta,
  type VideoStatus,
} from '../api/userApi';
import { logUi } from '../log';

const props = defineProps<{ publicId: string }>();

const route = useRoute();
const publicId = computed(() => (props.publicId || (route.params.publicId as string)) ?? '');

const loading = ref(true);
const err = ref('');
const meta = ref<VideoMeta | null>(null);
const playErr = ref('');
const copyErr = ref('');
const copied = ref(false);

const POLL_MS = 3000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

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

function stopPoll() {
  if (pollTimer) {
    logUi('watch', 'остановлен poll', { publicId: publicId.value });
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPoll() {
  stopPoll();
  logUi('watch', 'начат poll статуса', { publicId: publicId.value, intervalMs: POLL_MS });
  pollTimer = setInterval(() => {
    void load({ silent: true });
  }, POLL_MS);
}

function onVideoError() {
  playErr.value = 'Не удалось воспроизвести видео.';
  logUi('watch', 'ошибка плеера', { publicId: publicId.value });
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
    playErr.value = '';
    copyErr.value = '';
    copied.value = false;
  }
  const prevStatus = meta.value?.status;
  const prevStep = meta.value?.processingStep;
  try {
    const m = await getVideoMeta(publicId.value, { poll: opts?.silent });
    meta.value = m;
    document.title = `${m.title} — mvidia`;

    if (!opts?.silent) {
      logUi('watch', 'страница: состояние', {
        publicId: publicId.value,
        status: m.status,
        processingStep: m.processingStep,
      });
    } else if (prevStatus !== m.status || prevStep !== m.processingStep) {
      logUi('watch', 'статус изменился', {
        publicId: publicId.value,
        from: { status: prevStatus, step: prevStep },
        to: { status: m.status, step: m.processingStep },
      });
    }

    if (m.status === 'not_ready') {
      if (!pollTimer) startPoll();
    } else {
      stopPoll();
      if (m.status === 'ready') {
        logUi('watch', 'готово к воспроизведению', {
          publicId: publicId.value,
          sizeBytes: m.sizeBytes,
        });
      } else if (m.status === 'failed') {
        logUi('watch', 'ошибка обработки', {
          publicId: publicId.value,
          errorMessage: m.errorMessage,
        });
      }
    }
  } catch (e) {
    stopPoll();
    if (!opts?.silent) {
      err.value = e instanceof Error ? e.message : 'Ошибка';
      document.title = 'mvidia';
      logUi('watch', 'ошибка загрузки', {
        publicId: publicId.value,
        message: err.value,
      });
    }
  } finally {
    if (!opts?.silent) loading.value = false;
  }
}

onMounted(() => {
  void load();
});

onUnmounted(stopPoll);

watch(publicId, () => {
  stopPoll();
  void load();
});
</script>

<template>
  <div>
    <p v-if="loading">Загрузка…</p>
    <p v-else-if="err" class="err">{{ err }}</p>
    <template v-else-if="meta">
      <h1>{{ meta.title }}</h1>
      <p v-if="meta.authorName" class="author">Автор: {{ meta.authorName }}</p>

      <div v-if="status === 'ready'" class="share">
        <a class="share-link" :href="pageLink">{{ pageLink }}</a>
        <button type="button" class="copy-btn" @click="copyPageLink">
          {{ copied ? 'Скопировано' : 'Копировать ссылку' }}
        </button>
      </div>
      <p v-if="copyErr" class="err">{{ copyErr }}</p>

      <p v-if="status === 'not_ready'" class="processing">{{ processingLabel }}</p>

      <p v-else-if="status === 'failed'" class="err">
        {{ meta.errorMessage || 'Не удалось обработать видео' }}
      </p>

      <video
        v-else-if="status === 'ready'"
        class="player"
        controls
        playsinline
        :src="videoFileUrl(meta.publicId)"
        @error="onVideoError"
      />
      <p v-if="playErr" class="err">{{ playErr }}</p>
    </template>
  </div>
</template>

<style scoped>
.share {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin: 0.5rem 0 1rem;
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
.copy-btn:hover {
  background: #1e293b;
}
.author {
  color: #475569;
  margin: 0.25rem 0 0.75rem;
}
.processing {
  color: #475569;
  margin: 1rem 0;
}
.player {
  width: 100%;
  max-height: 70vh;
  background: #000;
  border-radius: 8px;
}
.err {
  color: #b91c1c;
}
</style>
