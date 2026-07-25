<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { Todo } from '../types';
import DateTimePicker from './DateTimePicker.vue';

const props = defineProps<{ task: Todo }>();
const emit = defineEmits<{
  (e: 'toggle', task: Todo): void;
  (e: 'delete', id: string): void;
  (e: 'update-task', updated: Todo): void;
}>();

const isEditing = ref(false);
const editTitle = ref('');
const editStartTime = ref('');
const editDueDate = ref('');

const startEditing = () => {
  editTitle.value = props.task.title;
  editStartTime.value = props.task.startTime || '';
  editDueDate.value = props.task.dueDate || '';
  isEditing.value = true;
};

const cancelEditing = () => {
  isEditing.value = false;
};

const handleSaveEdit = () => {
  if (!editTitle.value.trim()) return;
  emit('update-task', {
    ...props.task,
    title: editTitle.value.trim(),
    startTime: editStartTime.value || undefined,
    dueDate: editDueDate.value || undefined
  });
  isEditing.value = false;
};

const handleSaveShortcut = () => {
  if (isEditing.value && editTitle.value.trim()) {
    handleSaveEdit();
  }
};

onMounted(() => {
  window.addEventListener('app-save-shortcut', handleSaveShortcut);
});

onUnmounted(() => {
  window.removeEventListener('app-save-shortcut', handleSaveShortcut);
});

const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return '';
  let d: Date;
  let timeStr = '';
  
  if (dateStr.includes('T')) {
    const [dStr, tStr] = dateStr.split('T');
    d = new Date(dStr);
    timeStr = tStr ? tStr.substring(0, 5) : '';
  } else {
    d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    timeStr = `${hh}:${min}`;
  }

  if (isNaN(d.getTime())) return dateStr;

  const now = new Date();
  const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.getDate() === tomorrow.getDate() && d.getMonth() === tomorrow.getMonth() && d.getFullYear() === tomorrow.getFullYear();

  if (isToday) return `今天 ${timeStr}`.trim();
  if (isTomorrow) return `明天 ${timeStr}`.trim();
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${timeStr}`.trim();
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${timeStr}`.trim();
};

const displayStartTime = computed(() => {
  if (props.task.startTime) {
    return formatDateTime(props.task.startTime);
  }
  if (props.task.timeText && props.task.timeText.includes(' - ')) {
    return props.task.timeText.split(' - ')[0];
  }
  return '';
});

const displayDueDate = computed(() => {
  if (props.task.dueDate) {
    return formatDateTime(props.task.dueDate);
  }
  if (props.task.timeText) {
    if (props.task.timeText.includes(' - ')) {
      return props.task.timeText.split(' - ')[1];
    }
    return props.task.timeText;
  }
  return '';
});
</script>

<template>
  <div class="task-card" :class="{ completed: task.completed, 'is-editing': isEditing }">
    <!-- Header: Same structure for View & Edit modes -->
    <div class="card-header">
      <div class="header-left" @click="!isEditing && emit('toggle', task)">
        <div class="circle-checkbox" :class="{ checked: task.completed }" title="切换完成状态">
          <svg v-if="task.completed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>

        <input 
          v-if="isEditing"
          type="text" 
          v-model="editTitle" 
          placeholder="输入任务标题..." 
          class="card-title-input" 
          autofocus
          @keyup.enter="handleSaveEdit"
          @keyup.esc="cancelEditing"
        />
        <h3 v-else class="card-title" :class="{ completed: task.completed }">{{ task.title }}</h3>
      </div>

      <div class="header-actions">
        <template v-if="!isEditing">
          <button class="action-btn edit-btn" @click.stop="startEditing" title="编辑任务">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="action-btn delete-btn" @click.stop="emit('delete', task.id)" title="删除任务">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </template>
        <template v-else>
          <button class="action-btn cancel-btn" @click="cancelEditing" title="取消编辑">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          <button class="action-btn save-btn" :disabled="!editTitle.trim()" @click="handleSaveEdit" title="保存修改">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </button>
        </template>
      </div>
    </div>

    <!-- Divider: Same structure -->
    <div class="card-divider"></div>

    <!-- Details: Same structure -->
    <div class="card-details">
      <template v-if="!isEditing">
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
          <span class="time-value">{{ displayStartTime || '未设时间' }}</span>
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
          <span class="time-value">{{ displayDueDate || '未设时间' }}</span>
        </div>
      </template>

      <template v-else>
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
            v-model="editStartTime" 
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
            v-model="editDueDate" 
            placeholder="选择结束时间" 
            iconType="end" 
          />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.task-card {
  position: relative;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 156px;
  min-height: 156px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
}

.task-card:hover:not(.is-editing) {
  transform: translateY(-2px);
  border-color: var(--primary-color);
  box-shadow: 0 8px 20px -4px rgba(0, 0, 0, 0.06);
}

.task-card.completed {
  opacity: 0.75;
  background-color: var(--bg-sidebar);
}

/* Header bar */
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
  cursor: pointer;
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
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.header-left:hover .circle-checkbox {
  transform: scale(1.08);
}

.circle-checkbox.checked {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
}

.circle-checkbox svg {
  color: white;
  width: 12px;
  height: 12px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.2s;
}

.card-title.completed {
  text-decoration: line-through;
  color: var(--text-muted);
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

/* Header Action Buttons */
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

.edit-btn:hover {
  color: var(--primary-color);
}

.delete-btn:hover {
  color: var(--danger-color);
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

/* Dashed Divider */
.card-divider {
  border-top: 1px dashed var(--border-color);
  margin: 12px 0;
  width: 100%;
}

/* Bottom Details */
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
}

.calendar-icon {
  margin-right: 8px;
  flex-shrink: 0;
}

.calendar-icon.blue {
  color: var(--primary-color);
}

.calendar-icon.green {
  color: #10b981;
}

.calendar-icon.gray {
  color: var(--text-muted);
}

.time-label {
  color: var(--text-secondary);
  margin-right: 20px;
  font-size: 14.5px;
  font-weight: 500;
  white-space: nowrap;
}

.time-value {
  color: var(--text-main);
  font-size: 14.5px;
  font-weight: 500;
  white-space: nowrap;
}

:deep(.picker-trigger) {
  padding: 2px 8px;
  height: 26px;
  font-size: 13.5px;
  box-sizing: border-box;
}

/* Dark mode overrides */
:global(.dark) .task-card {
  background-color: var(--bg-sidebar);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}
</style>
