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

const getCurrentNowISO = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const handleSave = () => {
  if (!title.value.trim()) return;
  const finalStartTime = startTime.value || getCurrentNowISO();
  emit('save', {
    title: title.value.trim(),
    startTime: finalStartTime,
    dueDate: dueDate.value
  });
  title.value = '';
  startTime.value = '';
  dueDate.value = '';
};
</script>

<template>
  <div class="inline-task-card">
    <div class="card-edit-form">
      <div class="edit-header-row">
        <span class="new-badge">
          <span class="new-dot"></span>
          新建任务
        </span>
      </div>

      <!-- 任务名称输入 -->
      <div class="form-item">
        <input 
          type="text" 
          v-model="title" 
          placeholder="输入任务名称..." 
          class="card-edit-title-input"
          autofocus
          @keyup.enter="handleSave"
          @keyup.esc="emit('cancel')"
        />
      </div>

      <!-- 时间选择双列区域 -->
      <div class="form-time-row">
        <div class="time-field-box">
          <span class="field-label">开始时间</span>
          <DateTimePicker 
            v-model="startTime" 
            placeholder="选择开始时间" 
            iconType="start" 
          />
        </div>
        <div class="time-field-box">
          <span class="field-label">结束时间</span>
          <DateTimePicker 
            v-model="dueDate" 
            placeholder="选择结束时间" 
            iconType="end" 
          />
        </div>
      </div>

      <!-- 操作按钮行 -->
      <div class="form-actions-row">
        <button class="btn-cancel" @click="emit('cancel')">取消</button>
        <button class="btn-save" :disabled="!title.trim()" @click="handleSave">创建任务</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inline-task-card {
  background: var(--bg-main);
  border: 1.5px dashed var(--primary-color);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.14);
  box-sizing: border-box;
  animation: cardPop 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes cardPop {
  from { opacity: 0; transform: scale(0.96) translateY(6px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.card-edit-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.edit-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.new-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: var(--primary-color);
  background: var(--primary-light);
  padding: 2px 8px;
  border-radius: 4px;
}

.new-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--primary-color);
}

.card-edit-title-input {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 12px;
  outline: none;
  background: var(--bg-sidebar);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-main);
  box-sizing: border-box;
  transition: border-color 0.2s, background-color 0.2s;
}

.card-edit-title-input:focus {
  border-color: var(--primary-color);
  background: var(--bg-main);
}

.card-edit-title-input::placeholder {
  color: var(--text-muted);
}

.form-time-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--bg-sidebar);
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
}

.time-field-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field-label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  font-weight: 500;
}

.form-actions-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.btn-cancel, .btn-save {
  padding: 6px 14px;
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
:global(.dark) .inline-task-card {
  background-color: var(--bg-sidebar);
}

:global(.dark) .form-time-row {
  background-color: var(--bg-main);
}
</style>
