<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
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

function onVideoError() {
  playErr.value =
    'Не удалось воспроизвести. Частая причина — MP4 с HEVC (H.265): нужен H.264 (AVC). Перекодируйте файл и загрузите снова.';
}

async function load() {
  loading.value = true;
  err.value = '';
  title.value = '';
  src.value = '';
  playErr.value = '';
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
      <video v-if="src" class="player" controls playsinline @error="onVideoError">
        <source :src="src" type="video/mp4" />
      </video>
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
.err {
  color: #b91c1c;
}
</style>
