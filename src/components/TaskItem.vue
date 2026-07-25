<script setup lang="ts">
import { ref } from 'vue';
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
</script>

<template>
  <div class="task-card" :class="{ completed: task.completed, 'is-editing': isEditing }">
    <!-- View Mode -->
    <template v-if="!isEditing">
      <!-- 顶栏：复选框与状态 Badge -->
      <div class="card-header">
        <div class="checkbox-box" @click="emit('toggle', task)" title="标记完成状态">
          <div class="checkbox" :class="{ checked: task.completed }">
            <svg v-if="task.completed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>

        <span class="status-badge" :class="{ completed: task.completed }">
          <span class="badge-dot"></span>
          {{ task.completed ? '已完成' : '待处理' }}
        </span>
      </div>

      <!-- 卡片主体：任务标题 -->
      <div class="card-body">
        <h3 class="task-title" :class="{ completed: task.completed }">{{ task.title }}</h3>
      </div>

      <!-- 底栏：时间与操作按钮组 -->
      <div class="card-footer">
        <div class="time-tag" v-if="task.timeText" :title="task.timeText">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span class="time-text">{{ task.timeText }}</span>
        </div>
        <div v-else class="time-tag empty">
          <span>暂无时间</span>
        </div>

        <div class="actions-group">
          <button class="action-btn edit-btn" @click.stop="startEditing" title="编辑任务">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="action-btn delete-btn" @click.stop="emit('delete', task.id)" title="删除任务">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    </template>

    <!-- Inline Edit Card Mode -->
    <template v-else>
      <div class="inline-edit-container">
        <!-- 任务名称输入框 -->
        <div class="title-input-wrapper">
          <input 
            type="text" 
            v-model="editTitle" 
            placeholder="任务名称" 
            class="inline-title-input"
            autofocus
            @keyup.enter="handleSaveEdit"
            @keyup.esc="cancelEditing"
          />
        </div>

        <!-- 时间与操作控制组 -->
        <div class="edit-footer">
          <div class="time-pickers-group">
            <DateTimePicker 
              v-model="editStartTime" 
              placeholder="开始时间" 
              iconType="start" 
            />
            <span class="time-separator">至</span>
            <DateTimePicker 
              v-model="editDueDate" 
              placeholder="结束时间" 
              iconType="end" 
            />
          </div>

          <div class="edit-actions">
            <button class="btn-cancel" @click="cancelEditing">取消</button>
            <button class="btn-save" :disabled="!editTitle.trim()" @click="handleSaveEdit">保存</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Bento Grid Task Card Style */
.task-card {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 140px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
}

.task-card:hover:not(.is-editing) {
  transform: translateY(-3px);
  box-shadow: 0 12px 24px -6px rgba(0, 0, 0, 0.08);
  border-color: var(--primary-color);
}

.task-card.completed {
  opacity: 0.75;
  background-color: var(--bg-sidebar);
}

.task-card.is-editing {
  border-color: var(--primary-color);
  box-shadow: 0 8px 20px rgba(99, 102, 241, 0.15);
  background-color: var(--bg-main);
}

/* Card Header */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.checkbox-box {
  cursor: pointer;
  padding: 2px;
}

.checkbox {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.checkbox-box:hover .checkbox {
  border-color: var(--primary-color);
}

.checkbox.checked {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
}

.checkbox svg {
  color: white;
  width: 12px;
  height: 12px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
  background: var(--primary-light);
  color: var(--primary-color);
}

.status-badge.completed {
  background: var(--border-color);
  color: var(--text-muted);
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
}

/* Card Body */
.card-body {
  flex: 1;
  margin-bottom: 14px;
}

.task-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
  line-height: 1.4;
  word-break: break-word;
  transition: color 0.2s;
}

.task-title.completed {
  text-decoration: line-through;
  color: var(--text-muted);
}

/* Card Footer */
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.time-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg-sidebar);
  padding: 4px 8px;
  border-radius: 6px;
  max-width: 170px;
  overflow: hidden;
}

.time-tag.empty {
  opacity: 0.6;
}

.time-text {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.actions-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn {
  background: transparent;
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--bg-sidebar);
  color: var(--text-main);
}

.edit-btn:hover {
  color: var(--primary-color);
}

.delete-btn:hover {
  color: var(--danger-color);
}

/* Inline Edit Card Container */
.inline-edit-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.inline-title-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-main);
  box-sizing: border-box;
}

.inline-title-input::placeholder {
  color: var(--text-muted);
}

.edit-footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.time-pickers-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.time-separator {
  font-size: 12px;
  color: var(--text-muted);
}

.edit-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.btn-cancel, .btn-save {
  padding: 4px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.btn-cancel:hover {
  background: var(--bg-sidebar);
  color: var(--text-main);
}

.btn-save {
  background: var(--primary-color);
  border: none;
  color: #ffffff;
}

.btn-save:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Dark mode overrides */
:global(.dark) .task-card {
  background-color: var(--bg-sidebar);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

:global(.dark) .time-tag {
  background-color: var(--bg-main);
}
</style>
