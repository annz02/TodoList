<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { Todo } from '../types';
import DateTimePicker from './DateTimePicker.vue';
import { selectFolder } from '../utils/filePicker';

const props = defineProps<{ task: Todo; isSelected?: boolean }>();
const emit = defineEmits<{
  (e: 'toggle', task: Todo): void;
  (e: 'delete', id: string): void;
  (e: 'update-task', updated: Todo): void;
  (e: 'select', id: string): void;
}>();

const isEditing = ref(false);
const editTitle = ref('');
const editCategory = ref('');
const editGitUrl = ref('');
const editStartTime = ref('');
const editDueDate = ref('');

const handleSelectFolder = async () => {
  const folder = await selectFolder();
  if (folder) {
    editGitUrl.value = folder;
  }
};


const startEditing = () => {
  editTitle.value = props.task.title;
  editCategory.value = props.task.category || '';
  editGitUrl.value = props.task.gitUrl || '';
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
    category: editCategory.value.trim() || undefined,
    gitUrl: editGitUrl.value.trim() || undefined,
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

const handleEditShortcut = () => {
  if (props.isSelected && !isEditing.value) {
    startEditing();
  }
};

const handleCancelShortcut = () => {
  if (isEditing.value) {
    cancelEditing();
  }
};

onMounted(() => {
  window.addEventListener('app-save-shortcut', handleSaveShortcut);
  window.addEventListener('app-edit-shortcut', handleEditShortcut);
  window.addEventListener('app-cancel-shortcut', handleCancelShortcut);
});

onUnmounted(() => {
  window.removeEventListener('app-save-shortcut', handleSaveShortcut);
  window.removeEventListener('app-edit-shortcut', handleEditShortcut);
  window.removeEventListener('app-cancel-shortcut', handleCancelShortcut);
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
  if (props.task.timeText) {
    if (props.task.timeText.includes(' - ')) {
      return props.task.timeText.split(' - ')[0];
    }
    return props.task.timeText;
  }
  return '';
});

const displayDueDate = computed(() => {
  if (props.task.dueDate) {
    return formatDateTime(props.task.dueDate);
  }
  if (props.task.timeText && props.task.timeText.includes(' - ')) {
    return props.task.timeText.split(' - ')[1];
  }
  return '';
});
</script>

<template>
  <div 
    class="task-card" 
    :class="{ selected: isSelected, completed: task.completed, 'is-editing': isEditing }"
    @click="emit('select', task.id)"
  >
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
        <h3 v-else class="card-title" :class="{ completed: task.completed }" :title="task.title">{{ task.title }}</h3>
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
          <svg class="calendar-icon purple" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
            <line x1="7" y1="7" x2="7.01" y2="7"></line>
          </svg>
          <span class="time-label">分类</span>
          <span v-if="task.category" class="category-tag" :title="task.category">{{ task.category }}</span>
          <span v-else class="time-value muted">未设分类</span>
        </div>

        <div v-if="task.gitUrl" class="time-row git-row">
          <svg class="calendar-icon git-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="6" y1="3" x2="6" y2="15"></line>
            <circle cx="18" cy="6" r="3"></circle>
            <circle cx="6" cy="18" r="3"></circle>
            <path d="M18 9a9 9 0 0 1-9 9"></path>
          </svg>
          <span class="time-label">代码路径</span>
          <span class="git-path-tag" :title="task.gitUrl">{{ task.gitUrl }}</span>
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
          <svg class="calendar-icon purple" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
            <line x1="7" y1="7" x2="7.01" y2="7"></line>
          </svg>
          <span class="time-label">分类</span>
          <input 
            type="text" 
            v-model="editCategory" 
            placeholder="输入分类..." 
            class="category-input"
            @keyup.enter="handleSaveEdit"
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
          <div class="folder-select-trigger" @click="handleSelectFolder" :title="editGitUrl || '选择代码路径'">
            <span class="folder-path" :class="{ placeholder: !editGitUrl }">
              {{ editGitUrl || '选择代码路径' }}
            </span>
            <button v-if="editGitUrl" type="button" class="clear-folder-btn" @click.stop="editGitUrl = ''" title="清除路径">
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
  min-height: 190px;
  height: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
}

.task-card:hover:not(.is-editing) {
  transform: translateY(-2px);
  border-color: var(--primary-color);
  box-shadow: 0 8px 20px -4px rgba(0, 0, 0, 0.06);
}

.task-card.selected:not(.is-editing) {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px var(--primary-light), 0 8px 20px -4px rgba(0, 0, 0, 0.08);
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

.calendar-icon.purple {
  color: #8b5cf6;
}

.calendar-icon.blue {
  color: var(--primary-color);
}

.calendar-icon.green {
  color: var(--primary-color);
}

.calendar-icon.gray {
  color: var(--text-muted);
}

.calendar-icon.git-icon {
  color: #f97316;
}

.git-path-tag {
  display: inline-block;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.git-input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 13.5px;
  font-weight: 400;
  color: var(--text-main);
  padding: 0;
  height: 26px;
  box-sizing: border-box;
  flex: 1;
  max-width: 220px;
}

.git-input::placeholder {
  color: var(--text-muted);
  font-weight: 400;
  font-size: 13px;
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
  max-width: 220px;
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

.time-value.muted {
  color: var(--text-muted);
}

.category-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background-color: color-mix(in srgb, #8b5cf6 15%, transparent);
  color: #8b5cf6;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.2;
}

.category-input {
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
  max-width: 200px;
}

.category-input::placeholder {
  color: var(--text-muted);
  font-weight: 400;
  font-size: 13.5px;
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

:global(.dark) .category-tag {
  background-color: rgba(139, 92, 246, 0.25);
  color: #a78bfa;
}
</style>
