<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import DateTimePicker from './DateTimePicker.vue';
import { selectFolder } from '../utils/filePicker';

const props = defineProps<{
  initialStartTime?: string;
}>();

const emit = defineEmits<{
  (e: 'save', data: { title: string; category?: string; startTime: string; dueDate: string; gitUrl?: string }): void;
  (e: 'cancel'): void;
}>();

const getCurrentNowISO = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const title = ref('');
const category = ref('');
const gitUrl = ref('');
const startTime = ref(props.initialStartTime || getCurrentNowISO());
const dueDate = ref('');

watch(() => props.initialStartTime, (newVal) => {
  if (newVal) {
    startTime.value = newVal;
  } else {
    startTime.value = getCurrentNowISO();
  }
});

const handleSelectFolder = async () => {
  const folder = await selectFolder();
  if (folder) {
    gitUrl.value = folder;
  }
};

const handleSave = () => {
  if (!title.value.trim()) return;
  const finalStartTime = startTime.value || getCurrentNowISO();
  emit('save', {
    title: title.value.trim(),
    category: category.value.trim() || undefined,
    gitUrl: gitUrl.value.trim() || undefined,
    startTime: finalStartTime,
    dueDate: dueDate.value
  });
  title.value = '';
  category.value = '';
  gitUrl.value = '';
  startTime.value = getCurrentNowISO();
  dueDate.value = '';
};

const handleSaveShortcut = () => {
  if (title.value.trim()) {
    handleSave();
  }
};

const handleCancelShortcut = () => {
  emit('cancel');
};

onMounted(() => {
  window.addEventListener('app-save-shortcut', handleSaveShortcut);
  window.addEventListener('app-cancel-shortcut', handleCancelShortcut);
});

onUnmounted(() => {
  window.removeEventListener('app-save-shortcut', handleSaveShortcut);
  window.removeEventListener('app-cancel-shortcut', handleCancelShortcut);
});
</script>

<template>
  <div class="task-card create-card">
    <!-- Header: Same structure -->
    <div class="card-header">
      <div class="header-left">
        <div class="circle-checkbox" title="新建任务"></div>
        <input 
          type="text" 
          v-model="title" 
          placeholder="输入任务标题..." 
          class="card-title-input" 
          autofocus
          @keyup.enter="handleSave"
          @keyup.esc="emit('cancel')"
        />
      </div>

      <div class="header-actions">
        <button class="action-btn cancel-btn" @click="emit('cancel')" title="取消创建">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <button class="action-btn save-btn" :disabled="!title.trim()" @click="handleSave" title="完成创建">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </button>
      </div>
    </div>

    <!-- Divider: Same structure -->
    <div class="card-divider"></div>

    <!-- Details: Same structure -->
    <div class="card-details">
      <div class="time-row">
        <svg class="calendar-icon purple" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
          <line x1="7" y1="7" x2="7.01" y2="7"></line>
        </svg>
        <span class="time-label">分类</span>
        <input 
          type="text" 
          v-model="category" 
          placeholder="输入分类..." 
          class="category-input"
          @keyup.enter="handleSave"
        />
      </div>

      <div class="time-row">
        <svg class="calendar-icon git-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="6" y1="3" x2="6" y2="15"></line>
          <circle cx="18" cy="6" r="3"></circle>
          <circle cx="6" cy="18" r="3"></circle>
          <path d="M18 9a9 9 0 0 1-9 9"></path>
        </svg>
        <span class="time-label">代码路径</span>
        <div class="folder-select-trigger" @click="handleSelectFolder" :title="gitUrl || '选择代码路径'">
          <span class="folder-path" :class="{ placeholder: !gitUrl }">
            {{ gitUrl || '选择代码路径' }}
          </span>
          <button v-if="gitUrl" type="button" class="clear-folder-btn" @click.stop="gitUrl = ''" title="清除路径">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="time-row">
        <svg class="calendar-icon blue" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
          <circle cx="8" cy="14" r="0.8" fill="currentColor"></circle>
          <circle cx="12" cy="14" r="0.8" fill="currentColor"></circle>
          <circle cx="16" cy="14" r="0.8" fill="currentColor"></circle>
          <circle cx="8" cy="18" r="0.8" fill="currentColor"></circle>
          <circle cx="12" cy="18" r="0.8" fill="currentColor"></circle>
          <circle cx="16" cy="18" r="0.8" fill="currentColor"></circle>
        </svg>
        <span class="time-label">开始时间</span>
        <DateTimePicker 
          v-model="startTime" 
          placeholder="选择开始时间" 
          iconType="start" 
        />
      </div>

      <div class="time-row">
        <svg class="calendar-icon green" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
          <circle cx="8" cy="14" r="0.8" fill="currentColor"></circle>
          <circle cx="12" cy="14" r="0.8" fill="currentColor"></circle>
          <circle cx="16" cy="14" r="0.8" fill="currentColor"></circle>
          <circle cx="8" cy="18" r="0.8" fill="currentColor"></circle>
          <circle cx="12" cy="18" r="0.8" fill="currentColor"></circle>
          <circle cx="16" cy="18" r="0.8" fill="currentColor"></circle>
        </svg>
        <span class="time-label">结束时间</span>
        <DateTimePicker 
          v-model="dueDate" 
          placeholder="选择结束时间" 
          iconType="end" 
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-card.create-card {
  position: relative;
  background: var(--bg-main);
  border: 1.5px dashed var(--primary-color);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 12px;
  min-height: auto;
  height: auto;
  flex-shrink: 0;
  width: 100%;
  box-shadow: 0 8px 20px -4px rgba(59, 130, 246, 0.15);
  box-sizing: border-box;
  animation: cardPop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes cardPop {
  from { opacity: 0; transform: scale(0.97) translateY(4px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.card-header {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  height: 30px;
}

.header-left {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.circle-checkbox {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--primary-color);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-title-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
  box-sizing: border-box;
}

.card-title-input::placeholder {
  color: var(--text-muted);
  font-weight: 400;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  background: transparent;
  border: none;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background-color: var(--bg-sidebar);
  color: var(--text-main);
}

.save-btn:hover:not(:disabled) {
  color: var(--primary-color);
  background-color: var(--primary-light);
}

.save-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.cancel-btn:hover {
  color: var(--danger-color);
}

.card-divider {
  border-top: 1px dashed var(--border-color);
  margin: 0;
  width: 100%;
}

.card-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.time-row {
  display: flex;
  align-items: center;
  font-size: 14.5px;
  line-height: 1.5;
  height: 26px;
  width: 100%;
  min-width: 0;
}

.calendar-icon {
  margin-right: 8px;
  flex-shrink: 0;
}

.calendar-icon.purple {
  color: #8b5cf6;
}

.calendar-icon.blue {
  color: var(--primary-color);
}

.calendar-icon.green {
  color: var(--primary-color);
}

.calendar-icon.git-icon {
  color: #f97316;
}

.time-label {
  color: var(--text-secondary);
  margin-right: 12px;
  font-size: 14.5px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

.category-input, .git-input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-main);
  padding: 0;
  height: 26px;
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  max-width: 220px;
}

.category-input::placeholder, .git-input::placeholder {
  color: var(--text-muted);
  font-weight: 400;
  font-size: 13.5px;
}

.folder-select-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
  height: 26px;
  box-sizing: border-box;
  min-width: 0;
  flex: 1;
  transition: background-color 0.2s;
  user-select: none;
}

.folder-select-trigger:hover {
  background-color: var(--bg-sidebar);
}

.folder-path {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.folder-path.placeholder {
  color: var(--text-muted);
  font-weight: 400;
}

.clear-folder-btn {
  background: transparent;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border-radius: 50%;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
}

.clear-folder-btn:hover {
  color: var(--danger-color);
  background-color: rgba(239, 68, 68, 0.15);
}

:deep(.picker-trigger) {
  padding: 2px 8px;
  height: 26px;
  font-size: 13.5px;
  box-sizing: border-box;
}

/* Dark mode overrides */
:global(.dark) .task-card.create-card {
  background-color: var(--bg-sidebar);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}
</style>
