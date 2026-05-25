<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { getVideoMeta, videoFileUrl } from '../api/userApi';

const props = defineProps<{ publicId: string }>();

const route = useRoute();
const publicId = computed(() => (props.publicId || (route.params.publicId as string)) ?? '');

const loading = ref(true);
const err = ref('');
const title = ref('');
const src = ref('');
const playErr = ref('');
const preparingPlayback = ref(false);

let objectUrl: string | null = null;
let triedBlobFallback = false;
let remoteUrl = '';

function revokeObjectUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

async function loadViaBlob(url: string) {
  preparingPlayback.value = true;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('Не удалось загрузить файл видео');
    }
    const blob = await res.blob();
    revokeObjectUrl();
    objectUrl = URL.createObjectURL(blob);
    src.value = objectUrl;
    playErr.value = '';
  } finally {
    preparingPlayback.value = false;
  }
}

async function onVideoError() {
  if (triedBlobFallback || !remoteUrl) {
    playErr.value =
      'Не удалось воспроизвести в браузере. Скачайте файл по прямой ссылке или перезалейте скринкаст (старые записи без fast-start).';
    return;
  }
  triedBlobFallback = true;
  try {
    await loadViaBlob(remoteUrl);
  } catch (e) {
    playErr.value = e instanceof Error ? e.message : 'Не удалось воспроизвести видео';
  }
}

async function load() {
  loading.value = true;
  err.value = '';
  title.value = '';
  src.value = '';
  playErr.value = '';
  preparingPlayback.value = false;
  triedBlobFallback = false;
  remoteUrl = '';
  revokeObjectUrl();

  try {
    const meta = await getVideoMeta(publicId.value);
    title.value = meta.title;
    document.title = `${meta.title} — mvidia`;
    remoteUrl = videoFileUrl(meta.publicId);
    src.value = remoteUrl;
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

onUnmounted(() => {
  revokeObjectUrl();
});
</script>

<template>
  <div>
    <p v-if="loading">Загрузка…</p>
    <p v-else-if="err" class="err">{{ err }}</p>
    <template v-else>
      <h1>{{ title }}</h1>
      <p v-if="preparingPlayback" class="hint">Подготовка воспроизведения…</p>
      <video
        v-if="src"
        class="player"
        controls
        playsinline
        preload="auto"
        :src="src"
        @error="onVideoError"
      />
      <p v-if="remoteUrl" class="hint">
        <a :href="remoteUrl" download>Скачать MP4</a>
        — если в плеере чёрный экран, файл всё равно может быть целым.
      </p>
      <p v-if="playErr" class="err">{{ playErr }}</p>
    </template>
  </div>
</template>

<style scoped>
.player {
  width: 100%;
  max-height: 70vh;
  background: #000;
  border-radius: 8px;
}
.hint {
  margin-top: 0.75rem;
  color: #64748b;
  font-size: 0.9rem;
}
.hint a {
  color: #2563eb;
}
.err {
  color: #b91c1c;
}
</style>
