<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getVideoMeta, isVideoHidden, patchVideo, type VideoVisibility } from '../api/userApi';

const route = useRoute();
const router = useRouter();
const publicId = ref(String(route.params.publicId || ''));

const loading = ref(true);
const err = ref('');
const ok = ref('');
const busy = ref(false);

const title = ref('');
const description = ref('');
const visibility = ref<VideoVisibility>('public');
const prevVisibility = ref<VideoVisibility>('public');

onMounted(async () => {
  try {
    const m = await getVideoMeta(publicId.value);
    if (isVideoHidden(m)) {
      err.value = 'Редактирование недоступно';
      return;
    }
    title.value = m.title;
    description.value = m.description || '';
    visibility.value = m.visibility;
    prevVisibility.value = m.visibility;
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка';
  } finally {
    loading.value = false;
  }
});

async function save() {
  err.value = '';
  ok.value = '';
  if (
    prevVisibility.value === 'public' &&
    visibility.value === 'private' &&
    !confirm('Скрыть видео? По ссылке другие увидят только сообщение, что ролик скрыт.')
  ) {
    return;
  }
  busy.value = true;
  try {
    await patchVideo(publicId.value, {
      title: title.value.trim(),
      description: description.value.trim(),
      visibility: visibility.value,
    });
    ok.value = 'Сохранено';
    prevVisibility.value = visibility.value;
    window.setTimeout(() => {
      void router.push({ name: 'watch', params: { publicId: publicId.value } });
    }, 600);
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h1>Редактирование</h1>
  <p v-if="loading">Загрузка…</p>
  <template v-else-if="!err">
    <form class="form" @submit.prevent="save">
      <label class="field">
        <span>Название</span>
        <input v-model="title" type="text" maxlength="75" required />
      </label>
      <label class="field">
        <span>Описание</span>
        <textarea v-model="description" maxlength="300" rows="4" />
      </label>
      <label class="field">
        <span>Видимость</span>
        <select v-model="visibility">
          <option value="public">Всем по ссылке</option>
          <option value="private">Скрыто</option>
        </select>
      </label>
      <div class="actions">
        <button type="submit" :disabled="busy">{{ busy ? 'Сохранение…' : 'Сохранить' }}</button>
        <RouterLink class="link" :to="{ name: 'watch', params: { publicId } }">Отмена</RouterLink>
      </div>
    </form>
    <p v-if="ok" class="ok">{{ ok }}</p>
  </template>
  <p v-if="err" class="err">{{ err }}</p>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 24rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.field input,
.field textarea,
.field select {
  padding: 0.5rem 0.65rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font: inherit;
}
.actions {
  display: flex;
  align-items: center;
  gap: 1rem;
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
.link {
  color: #2563eb;
}
.ok {
  color: #15803d;
  margin-top: 1rem;
}
.err {
  color: #b91c1c;
}
</style>
