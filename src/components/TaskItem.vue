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
  <div class="task-item" :class="{ completed: task.completed, 'is-editing': isEditing }">
    <!-- View Mode -->
    <template v-if="!isEditing">
      <div class="task-left">
        <div class="checkbox" @click="emit('toggle', task)">
          <svg v-if="task.completed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <span class="task-title">{{ task.title }}</span>
      </div>
      <div class="task-right">
        <span class="time">{{ task.timeText }}</span>
        <div class="actions-group">
          <div class="action-btn edit-btn" @click.stop="startEditing" title="直接修改">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </div>
          <div class="action-btn delete-btn" @click.stop="emit('delete', task.id)" title="删除任务">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </div>
        </div>
      </div>
    </template>

    <!-- Inline Edit Mode -->
    <template v-else>
      <div class="inline-edit-container">
        <!-- 任务名称输入框 (无 label 前缀, 仅 placeholder 提示) -->
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
            <!-- 任务开始时间输入框 -->
            <DateTimePicker 
              v-model="editStartTime" 
              placeholder="开始时间" 
              iconType="start" 
            />

            <span class="time-separator">至</span>

            <!-- 任务结束时间输入框 -->
            <DateTimePicker 
              v-model="editDueDate" 
              placeholder="结束时间" 
              iconType="end" 
            />
          </div>

          <!-- 保存与取消按钮 -->
          <div class="edit-actions">
            <button class="btn-cancel" @click="cancelEditing">取消</button>
            <button class="btn-save" :disabled="!editTitle.trim()" @click="handleSaveEdit">保存修改</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.task-item.is-editing {
  flex-direction: column;
  align-items: stretch;
  border-color: var(--primary-color);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.12);
  padding: 14px 18px;
}

.inline-edit-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.title-input-wrapper {
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
  font-weight: 400;
}

.edit-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.time-pickers-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-separator {
  font-size: 13px;
  color: var(--text-muted);
}

.edit-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.btn-cancel, .btn-save {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
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
</style>
