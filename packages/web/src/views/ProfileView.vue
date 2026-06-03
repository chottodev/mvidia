<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { changePassword, fetchMe, updateName } from '../api/authApi';

const loading = ref(true);
const err = ref('');
const ok = ref('');

const phone = ref('');
const name = ref('');
const currentPassword = ref('');
const newPassword = ref('');
const busyName = ref(false);
const busyPass = ref(false);

onMounted(async () => {
  try {
    const u = await fetchMe();
    phone.value = u.phone;
    name.value = u.name;
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка';
  } finally {
    loading.value = false;
  }
});

async function saveName() {
  err.value = '';
  ok.value = '';
  busyName.value = true;
  try {
    const u = await updateName(name.value.trim());
    name.value = u.name;
    ok.value = 'Имя сохранено';
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка';
  } finally {
    busyName.value = false;
  }
}

async function savePassword() {
  err.value = '';
  ok.value = '';
  busyPass.value = true;
  try {
    await changePassword(currentPassword.value, newPassword.value);
    currentPassword.value = '';
    newPassword.value = '';
    ok.value = 'Пароль изменён';
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка';
  } finally {
    busyPass.value = false;
  }
}
</script>

<template>
  <h1>Профиль</h1>
  <p v-if="loading">Загрузка…</p>
  <template v-else>
    <section class="card">
      <h2>Данные</h2>
      <label class="field">
        <span>Телефон</span>
        <input :value="phone" type="text" readonly class="readonly" />
      </label>
      <label class="field">
        <span>Имя</span>
        <input v-model="name" type="text" maxlength="100" />
      </label>
      <button type="button" :disabled="busyName" @click="saveName">
        {{ busyName ? 'Сохранение…' : 'Сохранить имя' }}
      </button>
    </section>

    <section class="card">
      <h2>Смена пароля</h2>
      <p class="hint">Новый пароль: 6 символов (a–z, A–Z, цифры), строчная, заглавная и цифра.</p>
      <label class="field">
        <span>Текущий пароль</span>
        <input v-model="currentPassword" type="password" autocomplete="current-password" />
      </label>
      <label class="field">
        <span>Новый пароль</span>
        <input v-model="newPassword" type="password" autocomplete="new-password" maxlength="6" />
      </label>
      <button type="button" :disabled="busyPass" @click="savePassword">
        {{ busyPass ? 'Сохранение…' : 'Сменить пароль' }}
      </button>
    </section>

    <p v-if="ok" class="ok">{{ ok }}</p>
    <p v-if="err" class="err">{{ err }}</p>
  </template>
</template>

<style scoped>
.card {
  margin-top: 1.25rem;
  padding: 1rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  max-width: 24rem;
}
.card h2 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
}
.field input {
  padding: 0.5rem 0.65rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}
.readonly {
  background: #f1f5f9;
  color: #64748b;
}
.hint {
  color: #64748b;
  font-size: 0.9rem;
  margin: 0 0 0.75rem;
}
button {
  padding: 0.5rem 0.9rem;
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
.ok {
  color: #15803d;
  margin-top: 1rem;
}
</style>
