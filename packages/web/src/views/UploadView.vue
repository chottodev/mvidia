<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { uploadVideo, watchPageUrl, type VideoVisibility } from '../api/userApi';
import { isLoggedIn } from '../api/authApi';
import { logUi } from '../log';

const ACCEPT =
  '.mp4,.mov,.mkv,.webm,.avi,video/mp4,video/quicktime,video/x-matroska,video/webm,video/x-msvideo';

const router = useRouter();
const loggedIn = isLoggedIn();
const title = ref('');
const description = ref('');
const visibility = ref<VideoVisibility>('public');
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
    const r = await uploadVideo(file.value, title.value.trim(), {
      description: description.value.trim() || undefined,
      visibility: loggedIn ? visibility.value : 'public',
    });
    lastLink.value = watchPageUrl(r.publicId);
    router.push({ name: 'watch', params: { publicId: r.publicId } });
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка загрузки';
    logUi('upload', 'сбой', { message: err.value });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h1>Загрузка видео</h1>
  <p class="hint">
    Форматы: MP4, MOV, MKV, WebM, AVI — до 1 ГБ. Название до 75 символов, описание до 300.
    <template v-if="loggedIn"> Можно скрыть ролик от других пользователей.</template>
  </p>

  <form class="form" @submit.prevent="submit">
    <label class="field">
      <span>Название</span>
      <input v-model="title" type="text" maxlength="75" required placeholder="Например, демо" />
    </label>
    <label class="field">
      <span>Файл</span>
      <input type="file" :accept="ACCEPT" @change="onFile" />
    </label>
    <label class="field">
      <span>Описание (необязательно)</span>
      <textarea v-model="description" maxlength="300" rows="3" placeholder="Кратко о ролике" />
    </label>
    <label v-if="loggedIn" class="field">
      <span>Видимость</span>
      <select v-model="visibility">
        <option value="public">Всем по ссылке</option>
        <option value="private">Скрыто (только вы)</option>
      </select>
    </label>
    <button type="submit" :disabled="busy">{{ busy ? 'Загрузка…' : 'Отправить' }}</button>
  </form>

  <p v-if="err" class="err">{{ err }}</p>
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
.field input[type='text'],
.field textarea,
.field select {
  padding: 0.5rem 0.65rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font: inherit;
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
}
.err {
  color: #b91c1c;
  margin-top: 1rem;
}
</style>
