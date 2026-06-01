<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { getVideoMeta, videoFileUrl, watchPageUrl } from '../api/userApi';

const props = defineProps<{ publicId: string }>();

const route = useRoute();
const publicId = computed(() => (props.publicId || (route.params.publicId as string)) ?? '');

const loading = ref(true);
const err = ref('');
const title = ref('');
const src = ref('');
const playErr = ref('');
const copyErr = ref('');
const copied = ref(false);

const pageLink = computed(() =>
  publicId.value ? watchPageUrl(publicId.value) : ''
);

function onVideoError() {
  playErr.value =
    'Не удалось воспроизвести. Частая причина — MP4 с HEVC (H.265): нужен H.264 (AVC). Перекодируйте файл и загрузите снова.';
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

async function load() {
  loading.value = true;
  err.value = '';
  title.value = '';
  src.value = '';
  playErr.value = '';
  copyErr.value = '';
  copied.value = false;
  try {
    const meta = await getVideoMeta(publicId.value);
    title.value = meta.title;
    document.title = `${meta.title} — mvidia`;
    src.value = videoFileUrl(meta.publicId);
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка';
    document.title = 'mvidia';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(publicId, () => {
  void load();
});
</script>

<template>
  <div>
    <p v-if="loading">Загрузка…</p>
    <p v-else-if="err" class="err">{{ err }}</p>
    <template v-else>
      <h1>{{ title }}</h1>
      <div class="share">
        <a class="share-link" :href="pageLink">{{ pageLink }}</a>
        <button type="button" class="copy-btn" @click="copyPageLink">
          {{ copied ? 'Скопировано' : 'Копировать ссылку' }}
        </button>
      </div>
      <p v-if="copyErr" class="err">{{ copyErr }}</p>
      <video v-if="src" class="player" controls playsinline @error="onVideoError">
        <source :src="src" type="video/mp4" />
      </video>
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
