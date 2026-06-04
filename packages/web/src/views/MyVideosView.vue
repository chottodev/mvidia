<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { listMyVideos } from '../api/authApi';
import type { VideoMeta } from '../api/userApi';

const loading = ref(true);
const err = ref('');
const total = ref(0);
const items = ref<VideoMeta[]>([]);
const offset = ref(0);
const limit = ref(20);
const busy = ref(false);

function statusLabel(row: VideoMeta) {
  if (row.status === 'ready') return 'готово';
  if (row.status === 'failed') return 'ошибка';
  return 'обработка';
}

function visibilityLabel(row: VideoMeta) {
  return row.visibility === 'private' ? 'скрыто' : 'всем';
}

async function load() {
  busy.value = true;
  err.value = '';
  try {
    const r = await listMyVideos(offset.value, limit.value);
    total.value = r.total;
    items.value = r.items;
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка';
  } finally {
    busy.value = false;
    loading.value = false;
  }
}

function prevPage() {
  offset.value = Math.max(0, offset.value - limit.value);
  void load();
}

function nextPage() {
  if (offset.value + limit.value < total.value) {
    offset.value += limit.value;
    void load();
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <h1>Мои видео</h1>
  <p v-if="loading">Загрузка…</p>
  <template v-else>
    <p v-if="err" class="err">{{ err }}</p>
    <p v-else class="muted">Всего: {{ total }}</p>
    <div v-if="!err" class="pager">
      <button type="button" :disabled="busy || offset === 0" @click="prevPage">Назад</button>
      <button type="button" :disabled="busy || offset + limit >= total" @click="nextPage">Вперёд</button>
    </div>
    <ul v-if="items.length" class="list">
      <li v-for="row in items" :key="row.publicId">
        <RouterLink :to="{ name: 'watch', params: { publicId: row.publicId } }">
          {{ row.title }}
        </RouterLink>
        <span class="meta">
          {{ visibilityLabel(row) }} · {{ statusLabel(row) }} ·
          {{ new Date(row.createdAt).toLocaleString('ru-RU') }}
        </span>
        <RouterLink class="edit" :to="{ name: 'editVideo', params: { publicId: row.publicId } }">
          Изменить
        </RouterLink>
      </li>
    </ul>
    <p v-else-if="!err" class="muted">Вы ещё не загружали видео под этим аккаунтом.</p>
  </template>
</template>

<style scoped>
.muted {
  color: #64748b;
}
.err {
  color: #b91c1c;
}
.pager {
  display: flex;
  gap: 0.5rem;
  margin: 0.75rem 0;
}
.pager button {
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #fff;
  cursor: pointer;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.list li {
  padding: 0.65rem 0;
  border-bottom: 1px solid #e2e8f0;
}
.list a {
  color: #2563eb;
  font-weight: 600;
  text-decoration: none;
}
.meta {
  display: block;
  font-size: 0.85rem;
  color: #64748b;
  margin-top: 0.2rem;
}
.edit {
  display: inline-block;
  margin-top: 0.35rem;
  font-size: 0.85rem;
  color: #475569;
}
</style>
