<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <div class="layout">
    <header class="header">
      <strong>mvidia</strong>
      <nav>
        <RouterLink to="/">Загрузка</RouterLink>
        <RouterLink to="/screencast">Скринкаст</RouterLink>
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
.header a {
  color: #93c5fd;
  text-decoration: none;
}
.header a.router-link-active {
  color: #fff;
  text-decoration: underline;
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
