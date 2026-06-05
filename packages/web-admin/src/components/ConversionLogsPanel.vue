<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  cancelConversionJob,
  listConversionLogs,
  type AdminAuth,
  type ConversionLogRow,
} from '../api/adminApi';

const props = defineProps<{ auth: AdminAuth }>();

const err = ref('');
const busy = ref(false);
const offset = ref(0);
const limit = ref(20);
const total = ref(0);
const items = ref<ConversionLogRow[]>([]);
const filterPublicId = ref('');

function statusLabel(status: string) {
  if (status === 'running') return 'в работе';
  if (status === 'completed') return 'завершено';
  if (status === 'failed') return 'ошибка';
  if (status === 'cancelled') return 'отменено';
  if (status === 'skipped') return 'пропуск';
  return status;
}

function canCancel(row: ConversionLogRow) {
  return row.status === 'running' && !!row.jobId;
}

async function cancelJob(row: ConversionLogRow) {
  if (!row.jobId || !confirm(`Отменить конвертацию job ${row.jobId}?`)) return;
  busy.value = true;
  err.value = '';
  try {
    await cancelConversionJob(props.auth, row.jobId);
    await refresh();
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка отмены';
  } finally {
    busy.value = false;
  }
}

function formatBytes(bytes: number | null) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}

function formatVideoDuration(sec: number | null) {
  if (sec == null || sec <= 0) return '—';
  const totalSec = Math.round(sec);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatWorkDuration(ms: number | null) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} мс`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m} мин ${s} с`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h} ч ${rm} мин`;
}

function strategyLabel(row: ConversionLogRow) {
  if (!row.strategy) return '—';
  if (row.usedCopy === true) return `${row.strategy} (copy)`;
  return row.strategy;
}

async function refresh() {
  err.value = '';
  busy.value = true;
  try {
    const r = await listConversionLogs(
      props.auth,
      offset.value,
      limit.value,
      filterPublicId.value
    );
    total.value = r.total;
    items.value = r.items;
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Ошибка загрузки';
  } finally {
    busy.value = false;
  }
}

function applyFilter() {
  offset.value = 0;
  void refresh();
}

function clearFilter() {
  filterPublicId.value = '';
  offset.value = 0;
  void refresh();
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
</script>

<template>
  <div>
    <div class="toolbar">
      <h1>Журнал конвертации</h1>
      <button type="button" :disabled="busy" @click="refresh">Обновить</button>
    </div>

    <div class="filter">
      <label>
        publicId
        <input v-model="filterPublicId" class="mono" placeholder="фильтр…" @keyup.enter="applyFilter" />
      </label>
      <button type="button" :disabled="busy" @click="applyFilter">Найти</button>
      <button type="button" class="ghost-btn" :disabled="busy || !filterPublicId" @click="clearFilter">
        Сброс
      </button>
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
          <th>Начало</th>
          <th>publicId</th>
          <th>jobId</th>
          <th>Попытка</th>
          <th>Статус</th>
          <th>Исходник</th>
          <th>Длит. видео</th>
          <th>Работа воркера</th>
          <th>Режим</th>
          <th>Результат</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in items" :key="row.id">
          <td>{{ new Date(row.startedAt).toLocaleString('ru-RU') }}</td>
          <td class="mono">{{ row.publicId }}</td>
          <td class="mono">{{ row.jobId || '—' }}</td>
          <td>{{ row.attempt }}</td>
          <td>{{ statusLabel(row.status) }}</td>
          <td>{{ formatBytes(row.sourceSizeBytes) }}</td>
          <td>{{ formatVideoDuration(row.videoDurationSec) }}</td>
          <td>{{ formatWorkDuration(row.workDurationMs) }}</td>
          <td>{{ strategyLabel(row) }}</td>
          <td>
            <template v-if="row.status === 'completed'">
              {{ formatBytes(row.deliverySizeBytes) }}
            </template>
            <span v-else-if="row.errorMessage" class="err-inline" :title="row.errorMessage">
              {{ row.errorMessage.length > 80 ? row.errorMessage.slice(0, 80) + '…' : row.errorMessage }}
            </span>
            <span v-else class="muted">—</span>
          </td>
          <td>
            <button
              v-if="canCancel(row)"
              type="button"
              class="danger"
              :disabled="busy"
              @click="cancelJob(row)"
            >
              Отменить
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.filter {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.5rem 0.75rem;
  margin: 0.75rem 0 1rem;
}
.filter label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
}
.filter input {
  padding: 0.4rem 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  min-width: 14rem;
}
.ghost-btn {
  background: #fff;
  color: #334155;
  border: 1px solid #cbd5e1;
}
.err-inline {
  color: #b91c1c;
  font-size: 0.85rem;
  word-break: break-word;
}
</style>
