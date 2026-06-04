<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { login } from '../api/authApi';

const router = useRouter();
const route = useRoute();

const phone = ref('');
const password = ref('');
const busy = ref(false);
const err = ref('');

async function submit() {
  err.value = '';
  busy.value = true;
  try {
    await login(phone.value.trim(), password.value);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    await router.push(redirect || '/');
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка входа';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h1>Вход</h1>
  <p class="hint">Телефон России (+7). Пароль: 6 символов (латиница и цифры), минимум одна строчная, заглавная и цифра.</p>
  <form class="form" @submit.prevent="submit">
    <label class="field">
      <span>Телефон</span>
      <input v-model="phone" type="tel" autocomplete="tel" placeholder="+7 900 123-45-67" required />
    </label>
    <label class="field">
      <span>Пароль</span>
      <input v-model="password" type="password" autocomplete="current-password" required />
    </label>
    <button type="submit" :disabled="busy">{{ busy ? 'Вход…' : 'Войти' }}</button>
  </form>
  <p v-if="err" class="err">{{ err }}</p>
  <p class="foot">
    Нет аккаунта?
    <RouterLink to="/register">Регистрация</RouterLink>
  </p>
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
  max-width: 22rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.field input {
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
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
}
.err {
  color: #b91c1c;
  margin-top: 1rem;
}
.foot {
  margin-top: 1.5rem;
}
.foot a {
  color: #2563eb;
}
</style>
