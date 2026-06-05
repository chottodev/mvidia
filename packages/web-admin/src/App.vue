<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  adminApiBase,
  clearAuth,
  getConfig,
  listVideos,
  loadAuth,
  saveAuth,
  type AdminAuth,
} from './api/adminApi';
import VideosPanel from './components/VideosPanel.vue';
import UsersPanel from './components/UsersPanel.vue';
import ConversionLogsPanel from './components/ConversionLogsPanel.vue';

type Tab = 'videos' | 'users' | 'conversions';

const auth = ref<AdminAuth | null>(null);
const loginUser = ref('');
const loginPass = ref('');
const err = ref('');
const busy = ref(false);
const tab = ref<Tab>('videos');

const publicSiteUrl = ref<string | null>(null);
const userApiDocsUrl = ref<string | null>(null);

async function loadPublicSiteUrl() {
  if (!auth.value) {
    publicSiteUrl.value = null;
    userApiDocsUrl.value = null;
    return;
  }
  try {
    const cfg = await getConfig(auth.value);
    publicSiteUrl.value = cfg.publicSiteUrl;
    userApiDocsUrl.value = cfg.userApiDocsUrl;
  } catch {
    publicSiteUrl.value = null;
    userApiDocsUrl.value = null;
  }
}

onMounted(() => {
  auth.value = loadAuth();
  if (auth.value) {
    void loadPublicSiteUrl();
  }
});

async function login() {
  err.value = '';
  busy.value = true;
  const a: AdminAuth = { user: loginUser.value.trim(), pass: loginPass.value };
  try {
    await listVideos(a, 0, 1);
    saveAuth(a);
    auth.value = a;
    await loadPublicSiteUrl();
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка входа';
  } finally {
    busy.value = false;
  }
}

function logout() {
  clearAuth();
  auth.value = null;
  publicSiteUrl.value = null;
  userApiDocsUrl.value = null;
}
</script>

<template>
  <div class="layout">
    <header class="header">
      <strong>mvidia — админка</strong>
      <span class="meta">Admin API: {{ adminApiBase() }}</span>
      <nav v-if="auth" class="tabs">
        <button type="button" :class="{ active: tab === 'videos' }" @click="tab = 'videos'">Видео</button>
        <button type="button" :class="{ active: tab === 'users' }" @click="tab = 'users'">Пользователи</button>
        <button type="button" :class="{ active: tab === 'conversions' }" @click="tab = 'conversions'">Конвертация</button>
      </nav>
      <a
        v-if="userApiDocsUrl"
        class="header-link"
        :href="userApiDocsUrl"
        target="_blank"
        rel="noreferrer"
      >User API — OpenAPI</a>
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
        <VideosPanel
          v-if="tab === 'videos'"
          :auth="auth"
          :public-site-url="publicSiteUrl"
        />
        <ConversionLogsPanel v-else-if="tab === 'conversions'" :auth="auth" />
        <UsersPanel v-else :auth="auth" />
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
  flex-wrap: wrap;
  padding: 0.75rem 1.25rem;
  background: #0f172a;
  color: #f8fafc;
}
.meta {
  opacity: 0.85;
  font-size: 0.85rem;
}
.tabs {
  display: flex;
  gap: 0.35rem;
}
.tabs button {
  background: transparent;
  color: #93c5fd;
  border: 1px solid #475569;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}
.tabs button.active {
  background: #1e293b;
  color: #fff;
  border-color: #64748b;
}
.header-link {
  color: #93c5fd;
  font-size: 0.85rem;
  text-decoration: none;
}
.header-link:hover {
  text-decoration: underline;
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
  max-width: 1200px;
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
