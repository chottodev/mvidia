<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  deleteUser,
  getUser,
  listUsers,
  updateUser,
  type AdminAuth,
  type UserDetail,
  type UserRow,
} from '../api/adminApi';

const props = defineProps<{ auth: AdminAuth }>();

const err = ref('');
const ok = ref('');
const busy = ref(false);
const offset = ref(0);
const limit = ref(20);
const total = ref(0);
const items = ref<UserRow[]>([]);

const selectedId = ref<string | null>(null);
const detail = ref<UserDetail | null>(null);
const editName = ref('');
const editPhone = ref('');
const editPassword = ref('');
const detailBusy = ref(false);
const detailErr = ref('');

async function refresh() {
  err.value = '';
  busy.value = true;
  try {
    const r = await listUsers(props.auth, offset.value, limit.value);
    total.value = r.total;
    items.value = r.items;
    if (selectedId.value && !r.items.some((u) => u.id === selectedId.value)) {
      closeDetail();
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка загрузки';
  } finally {
    busy.value = false;
  }
}

function closeDetail() {
  selectedId.value = null;
  detail.value = null;
  editName.value = '';
  editPhone.value = '';
  editPassword.value = '';
  detailErr.value = '';
  ok.value = '';
}

async function openUser(id: string) {
  selectedId.value = id;
  detail.value = null;
  detailErr.value = '';
  ok.value = '';
  detailBusy.value = true;
  try {
    const u = await getUser(props.auth, id);
    detail.value = u;
    editName.value = u.name;
    editPhone.value = u.phone;
    editPassword.value = '';
  } catch (e) {
    detailErr.value = e instanceof Error ? e.message : 'Ошибка';
    selectedId.value = null;
  } finally {
    detailBusy.value = false;
  }
}

async function saveUser() {
  if (!selectedId.value) return;
  detailErr.value = '';
  ok.value = '';
  detailBusy.value = true;
  try {
    const patch: { name: string; phone: string; password?: string } = {
      name: editName.value.trim(),
      phone: editPhone.value.trim(),
    };
    if (editPassword.value) {
      patch.password = editPassword.value;
    }
    await updateUser(props.auth, selectedId.value, patch);
    ok.value = 'Сохранено';
    editPassword.value = '';
    await openUser(selectedId.value);
    await refresh();
  } catch (e) {
    detailErr.value = e instanceof Error ? e.message : 'Ошибка';
  } finally {
    detailBusy.value = false;
  }
}

async function removeUser() {
  if (!selectedId.value || !detail.value) return;
  if (!confirm(`Удалить пользователя «${detail.value.name}» (${detail.value.phone})?`)) return;
  detailBusy.value = true;
  detailErr.value = '';
  try {
    await deleteUser(props.auth, selectedId.value);
    closeDetail();
    await refresh();
  } catch (e) {
    detailErr.value = e instanceof Error ? e.message : 'Ошибка удаления';
  } finally {
    detailBusy.value = false;
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
  <div class="users-layout">
    <div class="users-list">
      <div class="toolbar">
        <h1>Пользователи</h1>
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
            <th>Имя</th>
            <th>Телефон</th>
            <th>Создан</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in items"
            :key="row.id"
            :class="{ selected: row.id === selectedId }"
          >
            <td>{{ row.name }}</td>
            <td class="mono">{{ row.phone }}</td>
            <td>{{ new Date(row.createdAt).toLocaleString('ru-RU') }}</td>
            <td>
              <button type="button" :disabled="busy" @click="openUser(row.id)">Открыть</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <aside v-if="selectedId" class="user-detail card">
      <div class="detail-head">
        <h2>Пользователь</h2>
        <button type="button" class="ghost-sm" @click="closeDetail">Закрыть</button>
      </div>

      <p v-if="detailBusy && !detail">Загрузка…</p>
      <template v-else-if="detail">
        <p class="muted">id: <span class="mono">{{ detail.id }}</span></p>
        <p class="muted">Видео: {{ detail.videoCount }}</p>
        <p class="muted">Регистрация: {{ new Date(detail.createdAt).toLocaleString('ru-RU') }}</p>

        <form class="form" @submit.prevent="saveUser">
          <label>
            Имя
            <input v-model="editName" type="text" maxlength="100" required />
          </label>
          <label>
            Телефон
            <input v-model="editPhone" type="tel" required />
          </label>
          <label>
            Новый пароль
            <input
              v-model="editPassword"
              type="password"
              maxlength="6"
              autocomplete="new-password"
              placeholder="оставить пустым — не менять"
            />
          </label>
          <p class="hint">
            Пароль: 6 символов (латиница и цифры), минимум одна строчная, заглавная и цифра.
          </p>
          <div class="actions">
            <button type="submit" :disabled="detailBusy">{{ detailBusy ? 'Сохранение…' : 'Сохранить' }}</button>
            <button type="button" class="danger" :disabled="detailBusy" @click="removeUser">Удалить</button>
          </div>
        </form>

        <p v-if="ok" class="ok">{{ ok }}</p>
        <p v-if="detailErr" class="err">{{ detailErr }}</p>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.users-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
}
@media (min-width: 900px) {
  .users-layout {
    grid-template-columns: 1fr min(22rem, 40%);
  }
}
.users-list {
  min-width: 0;
}
.user-detail {
  align-self: start;
  position: sticky;
  top: 1rem;
}
.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.detail-head h2 {
  margin: 0;
  font-size: 1.1rem;
}
.ghost-sm {
  background: transparent;
  color: #64748b;
  border: 1px solid #cbd5e1;
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1rem;
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
.hint {
  color: #64748b;
  font-size: 0.85rem;
  margin: 0;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
tr.selected td {
  background: #eff6ff;
}
.ok {
  color: #15803d;
  margin-top: 0.75rem;
}
</style>
