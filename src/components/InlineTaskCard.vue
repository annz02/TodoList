<script setup lang="ts">
import { ref } from 'vue';
import DateTimePicker from './DateTimePicker.vue';

const emit = defineEmits<{
  (e: 'save', data: { title: string; startTime: string; dueDate: string }): void;
  (e: 'cancel'): void;
}>();

const title = ref('');
const startTime = ref('');
const dueDate = ref('');

const handleSave = () => {
  if (!title.value.trim()) return;
  emit('save', {
    title: title.value.trim(),
    startTime: startTime.value,
    dueDate: dueDate.value
  });
  title.value = '';
  startTime.value = '';
  dueDate.value = '';
};
</script>

<template>
  <div class="inline-task-card">
    <div class="card-content">
      <!-- 任务名称输入框 (无 label 前缀, 仅 placeholder 提示) -->
      <div class="title-input-wrapper">
        <input 
          type="text" 
          v-model="title" 
          placeholder="任务名称" 
          class="inline-title-input"
          autofocus
          @keyup.enter="handleSave"
          @keyup.esc="emit('cancel')"
        />
      </div>

      <!-- 时间与按钮控制区 -->
      <div class="card-footer">
        <div class="time-pickers-group">
          <!-- 任务开始时间选择器 -->
          <DateTimePicker 
            v-model="startTime" 
            placeholder="开始时间" 
            iconType="start" 
          />

          <span class="time-separator">至</span>

          <!-- 任务结束时间选择器 -->
          <DateTimePicker 
            v-model="dueDate" 
            placeholder="结束时间" 
            iconType="end" 
          />
        </div>

        <!-- 操作按钮 -->
        <div class="actions">
          <button class="btn-cancel" @click="emit('cancel')">取消</button>
          <button class="btn-save" :disabled="!title.trim()" @click="handleSave">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inline-task-card {
  background: var(--bg-main);
  border: 1.5px solid var(--primary-color);
  border-radius: 12px;
  padding: 14px 18px;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.12);
  margin-top: 10px;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.card-footer {
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

.actions {
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

/* Dark Mode support */
:global(.dark) .inline-task-card {
  background-color: var(--bg-sidebar);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
</style>
