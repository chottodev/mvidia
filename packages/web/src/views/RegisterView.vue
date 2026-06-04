<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { register } from '../api/authApi';

const router = useRouter();

const phone = ref('');
const password = ref('');
const name = ref('');
const busy = ref(false);
const err = ref('');

async function submit() {
  err.value = '';
  busy.value = true;
  try {
    await register(phone.value.trim(), password.value, name.value.trim());
    await router.push('/');
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка регистрации';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h1>Регистрация</h1>
  <p class="hint">
    Телефон РФ (+7). Пароль: 6 символов (латиница и цифры), минимум одна строчная, одна заглавная и одна цифра.
  </p>
  <form class="form" @submit.prevent="submit">
    <label class="field">
      <span>Телефон</span>
      <input v-model="phone" type="tel" autocomplete="tel" placeholder="+7 900 123-45-67" required />
    </label>
    <label class="field">
      <span>Имя</span>
      <input v-model="name" type="text" maxlength="100" required />
    </label>
    <label class="field">
      <span>Пароль</span>
      <input v-model="password" type="password" autocomplete="new-password" maxlength="6" required />
    </label>
    <button type="submit" :disabled="busy">{{ busy ? 'Создание…' : 'Зарегистрироваться' }}</button>
  </form>
  <p v-if="err" class="err">{{ err }}</p>
  <p class="foot">
    Уже есть аккаунт?
    <RouterLink to="/login">Войти</RouterLink>
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
