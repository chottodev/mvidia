<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  deleteVideo,
  listVideos,
  type AdminAuth,
  type VideoRow,
} from '../api/adminApi';

const props = defineProps<{
  auth: AdminAuth;
  publicSiteUrl: string | null;
}>();

const err = ref('');
const busy = ref(false);
const offset = ref(0);
const limit = ref(20);
const total = ref(0);
const items = ref<VideoRow[]>([]);

function watchUrl(publicId: string) {
  const base = props.publicSiteUrl?.replace(/\/$/, '');
  if (!base) return `/v/${publicId}`;
  return `${base}/v/${publicId}`;
}

function statusLabel(status: string) {
  if (status === 'ready') return 'готово';
  if (status === 'failed') return 'ошибка';
  return 'обработка';
}

function formatSize(row: VideoRow) {
  const bytes = row.status === 'ready' ? row.sizeBytes : row.sourceSizeBytes;
  if (bytes == null) return '—';
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}

async function refresh() {
  err.value = '';
  busy.value = true;
  try {
    const r = await listVideos(props.auth, offset.value, limit.value);
    total.value = r.total;
    items.value = r.items;
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка загрузки';
  } finally {
    busy.value = false;
  }
}

async function remove(publicId: string) {
  if (!confirm(`Удалить «${publicId}»?`)) return;
  busy.value = true;
  err.value = '';
  try {
    await deleteVideo(props.auth, publicId);
    await refresh();
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка удаления';
  } finally {
    busy.value = false;
  }
}

function prevPage() {
  offset.value = Math.max(0, offset.value - limit.value);
  void refresh();
}

function nextPage() {
  if (offset.value + limit.value < total.value) {
    offset.value += limit.value;
    void refresh();
  }
}

onMounted(() => {
  void refresh();
});

defineExpose({ refresh });
</script>

<template>
  <div>
    <div class="toolbar">
      <h1>Видео</h1>
      <button type="button" :disabled="busy" @click="refresh">Обновить</button>
    </div>
    <p v-if="!publicSiteUrl" class="err">
      В .env не задан USER_PUBLIC_SITE_URL — укажите публичный URL user-сайта для ссылок «открыть».
    </p>
    <p v-else-if="publicSiteUrl" class="muted">Публичный сайт: {{ publicSiteUrl }}</p>
    <p v-if="err" class="err">{{ err }}</p>
    <p class="muted">Всего: {{ total }}. Страница offset={{ offset }}, limit={{ limit }}.</p>

    <div class="pager">
      <button type="button" :disabled="busy || offset === 0" @click="prevPage">Назад</button>
      <button type="button" :disabled="busy || offset + limit >= total" @click="nextPage">Вперёд</button>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th>Название</th>
          <th>publicId</th>
          <th>Автор</th>
          <th>Статус</th>
          <th>Размер</th>
          <th>Создано</th>
          <th>Ссылка</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in items" :key="row.publicId">
          <td>{{ row.title }}</td>
          <td class="mono">{{ row.publicId }}</td>
          <td>{{ row.authorName || '—' }}</td>
          <td>{{ statusLabel(row.status) }}</td>
          <td>{{ formatSize(row) }}</td>
          <td>{{ new Date(row.createdAt).toLocaleString('ru-RU') }}</td>
          <td>
            <a
              v-if="row.status === 'ready'"
              :href="watchUrl(row.publicId)"
              target="_blank"
              rel="noreferrer"
            >открыть</a>
            <span v-else class="muted">—</span>
          </td>
          <td>
            <button type="button" class="danger" :disabled="busy" @click="remove(row.publicId)">Удалить</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
