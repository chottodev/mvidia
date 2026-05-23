<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { publicSiteBase, uploadVideo } from '../api/userApi';
import { useScreencastRecorder } from '../composables/useScreencastRecorder';
import { makeScreencastTitle } from '../lib/screencastTitle';
import { isRecordingSecureContext } from '../lib/secureContext';

const router = useRouter();
const {
  phase,
  error: recorderError,
  formattedTime,
  uiAvailable,
  mp4Available,
  start,
  stop,
} = useScreencastRecorder();

const uploading = ref(false);
const pageError = ref('');
const lastLink = ref('');
const lastPublicId = ref('');

const secureContext = isRecordingSecureContext();
const canStart = computed(() => uiAvailable && mp4Available && secureContext);

async function onStart() {
  pageError.value = '';
  lastLink.value = '';
  lastPublicId.value = '';
  await start();
}

async function onStop() {
  pageError.value = '';
  try {
    const file = await stop();
    uploading.value = true;
    try {
      const title = makeScreencastTitle();
      const r = await uploadVideo(file, title);
      lastPublicId.value = r.publicId;
      lastLink.value = `${publicSiteBase()}/v/${r.publicId}`;
    } catch (e) {
      pageError.value = e instanceof Error ? e.message : 'Ошибка загрузки';
    } finally {
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
      Будет записано только изображение экрана (без звука). После остановки файл отправится на сервер как MP4
      (H.264), до 1 ГБ. Нужен Chrome или Edge; сайт — по HTTPS, localhost или 127.0.0.1.
    </p>
    <p v-if="!mp4Available" class="warn">
      В этом браузере нет записи в MP4 (H.264) — частая ситуация на <strong>Linux</strong>. Для обкатки попробуйте
      Chrome на Windows/macOS или
      <RouterLink to="/">загрузите готовый MP4</RouterLink>.
    </p>
    <p v-if="!secureContext" class="warn">
      Откройте сайт по <strong>https://</strong>, <strong>http://localhost</strong> или
      <strong>http://127.0.0.1</strong> — иначе браузер не даст доступ к экрану.
    </p>

    <div v-if="phase === 'idle' && !uploading && !lastLink" class="panel">
      <button type="button" class="primary" :disabled="!canStart" @click="onStart">
        Начать запись
      </button>
      <p v-if="!canStart" class="panel-hint">
        Кнопка станет активной, когда браузер поддерживает MP4 и адрес подходит для захвата экрана.
      </p>
    </div>

    <div v-else-if="phase === 'recording'" class="panel recording">
      <p class="status">
        Идёт запись <span class="timer">{{ formattedTime }}</span>
      </p>
      <button type="button" class="danger" @click="onStop">Стоп запись</button>
    </div>

    <div v-else-if="phase === 'stopping' || uploading" class="panel">
      <p class="status">{{ uploading ? 'Загрузка на сервер…' : 'Завершение записи…' }}</p>
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
.recording .status {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 1rem;
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
