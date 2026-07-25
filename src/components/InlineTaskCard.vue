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
    <div class="card-header">
      <span class="new-tag">
        <span class="new-dot"></span>
        新任务
      </span>
    </div>

    <div class="card-body">
      <!-- 任务名称输入框 (无 label 前缀, 仅 placeholder 提示) -->
      <input 
        type="text" 
        v-model="title" 
        placeholder="输入任务名称..." 
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
        <button class="btn-save" :disabled="!title.trim()" @click="handleSave">创建</button>
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
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 140px;
  box-shadow: 0 8px 20px rgba(99, 102, 241, 0.12);
  box-sizing: border-border;
  animation: cardPop 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes cardPop {
  from { opacity: 0; transform: scale(0.96) translateY(6px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.card-header {
  margin-bottom: 8px;
}

.new-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  background: var(--primary-light);
  color: var(--primary-color);
}

.new-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--primary-color);
}

.card-body {
  flex: 1;
  margin-bottom: 12px;
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

.card-footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-color);
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

.actions {
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

/* Dark Mode support */
:global(.dark) .inline-task-card {
  background-color: var(--bg-sidebar);
}
</style>
