<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { uploadVideo, watchPageUrl } from '../api/userApi';

const router = useRouter();
const title = ref('');
const file = ref<File | null>(null);
const busy = ref(false);
const err = ref('');
const lastLink = ref('');

function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  file.value = input.files?.[0] ?? null;
}

async function submit() {
  err.value = '';
  lastLink.value = '';
  if (!file.value) {
    err.value = 'Выберите файл';
    return;
  }
  if (!title.value.trim()) {
    err.value = 'Введите название';
    return;
  }
  busy.value = true;
  try {
    const r = await uploadVideo(file.value, title.value.trim());
    lastLink.value = watchPageUrl(r.publicId);
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка загрузки';
  } finally {
    busy.value = false;
  }
}

function goWatch() {
  const m = /\/v\/([^/?#]+)/.exec(lastLink.value);
  if (m) router.push({ name: 'watch', params: { publicId: m[1] } });
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(lastLink.value);
  } catch {
    err.value = 'Не удалось скопировать ссылку';
  }
}
</script>

<template>
  <h1>Загрузка видео</h1>
  <p class="hint">Только MP4 с кодеком H.264 (AVC), до 1 ГБ. HEVC (H.265) в браузере не проигрывается.</p>

  <form class="form" @submit.prevent="submit">
    <label class="field">
      <span>Название</span>
      <input v-model="title" type="text" maxlength="500" required placeholder="Например, демо ролик" />
    </label>
    <label class="field">
      <span>Файл (.mp4)</span>
      <input type="file" accept=".mp4,video/mp4" @change="onFile" />
    </label>
    <button type="submit" :disabled="busy">{{ busy ? 'Загрузка…' : 'Отправить' }}</button>
  </form>

  <p v-if="err" class="err">{{ err }}</p>

  <section v-if="lastLink" class="result">
    <h2>Готово</h2>
    <p>
      <a :href="lastLink">{{ lastLink }}</a>
    </p>
    <div class="row">
      <button type="button" @click="copyLink">Копировать ссылку</button>
      <button type="button" @click="goWatch">Открыть плеер</button>
    </div>
  </section>
</template>

<style scoped>
.hint {
  color: #64748b;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.field input[type='text'] {
  padding: 0.5rem 0.65rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}
button {
  padding: 0.55rem 1rem;
  border-radius: 6px;
  border: none;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
  font-weight: 600;
}
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
.row button {
  background: #0f172a;
}
</style>
