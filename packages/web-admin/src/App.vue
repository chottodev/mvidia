<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  adminApiBase,
  clearAuth,
  deleteVideo,
  loadAuth,
  listVideos,
  saveAuth,
  type AdminAuth,
} from './api/adminApi';

const auth = ref<AdminAuth | null>(null);
const loginUser = ref('');
const loginPass = ref('');
const err = ref('');
const busy = ref(false);

const offset = ref(0);
const limit = ref(20);
const total = ref(0);
const items = ref<
  Array<{
    publicId: string;
    title: string;
    sizeBytes: number;
    mimeType: string;
    createdAt: string;
  }>
>([]);

const publicWeb = computed(
  () => (import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5173').replace(/\/$/, '')
);

function watchUrl(publicId: string) {
  return `${publicWeb.value}/v/${publicId}`;
}

onMounted(() => {
  auth.value = loadAuth();
  if (auth.value) void refresh();
});

async function login() {
  err.value = '';
  busy.value = true;
  const a: AdminAuth = { user: loginUser.value.trim(), pass: loginPass.value };
  try {
    await listVideos(a, 0, 1);
    saveAuth(a);
    auth.value = a;
    offset.value = 0;
    await refresh();
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка входа';
  } finally {
    busy.value = false;
  }
}

function logout() {
  clearAuth();
  auth.value = null;
  items.value = [];
  total.value = 0;
}

async function refresh() {
  if (!auth.value) return;
  err.value = '';
  busy.value = true;
  try {
    const r = await listVideos(auth.value, offset.value, limit.value);
    total.value = r.total;
    items.value = r.items;
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка загрузки';
  } finally {
    busy.value = false;
  }
}

async function remove(publicId: string) {
  if (!auth.value) return;
  if (!confirm(`Удалить «${publicId}»?`)) return;
  busy.value = true;
  err.value = '';
  try {
    await deleteVideo(auth.value, publicId);
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
</script>

<template>
  <div class="layout">
    <header class="header">
      <strong>mvidia — админка</strong>
      <span class="meta">API: {{ adminApiBase() }}</span>
      <button v-if="auth" type="button" class="ghost" @click="logout">Выйти</button>
    </header>

    <main class="main">
      <section v-if="!auth" class="card">
        <h1>Вход</h1>
        <p class="hint">HTTP Basic (как в .env: ADMIN_USERNAME / ADMIN_PASSWORD).</p>
        <form class="form" @submit.prevent="login">
          <label>Логин <input v-model="loginUser" autocomplete="username" required /></label>
          <label>Пароль <input v-model="loginPass" type="password" autocomplete="current-password" required /></label>
          <button type="submit" :disabled="busy">{{ busy ? 'Проверка…' : 'Войти' }}</button>
        </form>
        <p v-if="err" class="err">{{ err }}</p>
      </section>

      <section v-else class="card">
        <div class="toolbar">
          <h1>Видео</h1>
          <button type="button" :disabled="busy" @click="refresh">Обновить</button>
        </div>
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
              <td>{{ (row.sizeBytes / (1024 * 1024)).toFixed(2) }} МБ</td>
              <td>{{ new Date(row.createdAt).toLocaleString('ru-RU') }}</td>
              <td>
                <a :href="watchUrl(row.publicId)" target="_blank" rel="noreferrer">открыть</a>
              </td>
              <td>
                <button type="button" class="danger" :disabled="busy" @click="remove(row.publicId)">Удалить</button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  </div>
</template>

<style>
:root {
  font-family: system-ui, sans-serif;
  color: #0f172a;
  background: #f1f5f9;
}
body {
  margin: 0;
}
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1.25rem;
  background: #0f172a;
  color: #f8fafc;
}
.meta {
  opacity: 0.85;
  font-size: 0.85rem;
}
.ghost {
  margin-left: auto;
  background: transparent;
  color: #e2e8f0;
  border: 1px solid #64748b;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
}
.main {
  flex: 1;
  padding: 1.5rem;
  max-width: 960px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}
.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1.25rem 1.5rem;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 20rem;
}
.form label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
}
.form input {
  padding: 0.45rem 0.55rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}
button {
  padding: 0.45rem 0.9rem;
  border-radius: 6px;
  border: none;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.danger {
  background: #b91c1c;
}
.hint {
  color: #64748b;
}
.err {
  color: #b91c1c;
}
.muted {
  color: #64748b;
  font-size: 0.9rem;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.pager {
  display: flex;
  gap: 0.5rem;
  margin: 0.75rem 0 1rem;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.table th,
.table td {
  border: 1px solid #e2e8f0;
  padding: 0.45rem 0.5rem;
  text-align: left;
  vertical-align: top;
}
.mono {
  font-family: ui-monospace, monospace;
  word-break: break-all;
}
</style>
