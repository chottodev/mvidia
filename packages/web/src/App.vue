<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { loadStoredUser, logout, type UserProfile } from './api/authApi';

const route = useRoute();

const user = ref<UserProfile | null>(null);

function refreshUser() {
  user.value = loadStoredUser();
}

onMounted(refreshUser);
watch(() => route.path, refreshUser);

async function onLogout() {
  await logout();
  user.value = null;
}
</script>

<template>
  <div class="layout">
    <header class="header">
      <strong>mvidia</strong>
      <nav class="nav">
        <RouterLink to="/">Загрузка</RouterLink>
        <RouterLink v-if="user" to="/my/videos">Мои видео</RouterLink>
        <template v-if="user">
          <span class="user">{{ user.name }}</span>
          <RouterLink to="/profile">Профиль</RouterLink>
          <button type="button" class="link-btn" @click="onLogout">Выйти</button>
        </template>
        <RouterLink v-else to="/login">Войти</RouterLink>
      </nav>
    </header>
    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<style>
:root {
  font-family: system-ui, sans-serif;
  color: #0f172a;
  background: #f8fafc;
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
  gap: 1.5rem;
  padding: 0.75rem 1.25rem;
  background: #0f172a;
  color: #f8fafc;
}
.nav {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.header a {
  color: #93c5fd;
  text-decoration: none;
}
.header a.router-link-active {
  color: #fff;
  text-decoration: underline;
}
.user {
  color: #e2e8f0;
  font-size: 0.95rem;
}
.link-btn {
  background: transparent;
  border: none;
  color: #93c5fd;
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-decoration: underline;
}
.link-btn:hover {
  color: #fff;
}
.main {
  flex: 1;
  padding: 1.5rem;
  max-width: 52rem;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}
</style>
