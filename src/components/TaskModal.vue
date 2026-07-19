<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ 
  show: boolean;
  initialTask?: { title: string; dueDate?: string; notify?: boolean } | null;
}>();
const emit = defineEmits<{ 
  (e: 'close'): void;
  (e: 'save', taskData: { title: string; dueDate: string; notify: boolean }): void;
}>();

const title = ref('');
const dueDate = ref('');
const notify = ref(false);

watch(() => props.show, (newVal) => {
  if (newVal) {
    if (props.initialTask) {
      title.value = props.initialTask.title;
      dueDate.value = props.initialTask.dueDate || '';
      notify.value = props.initialTask.notify || false;
    } else {
      title.value = '';
      const now = new Date();
      // Default to next hour, format as YYYY-MM-DDTHH:mm
      now.setHours(now.getHours() + 1, 0, 0, 0);
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      dueDate.value = now.toISOString().slice(0, 16);
      notify.value = false;
    }
  }
});

const handleSave = () => {
  if (!title.value.trim()) {
    alert('请输入任务名称');
    return;
  }
  emit('save', {
    title: title.value.trim(),
    dueDate: dueDate.value,
    notify: notify.value
  });
};
</script>

<template>
  <div v-if="show" class="modal-overlay" @click="emit('close')">
    <div class="modal-content" @click.stop style="width: 400px;">
      <div class="modal-header">
        <h2>{{ initialTask ? '修改任务' : '新建任务' }}</h2>
        <button class="close-btn" @click="emit('close')">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div class="setting-group" style="display: flex; flex-direction: column; gap: 8px;">
        <label>任务名称</label>
        <input type="text" v-model="title" class="form-input" placeholder="请输入任务名称" autofocus @keyup.enter="handleSave" />
      </div>

      <div class="setting-group" style="display: flex; flex-direction: column; gap: 8px;">
        <label>任务完成时间</label>
        <input type="datetime-local" v-model="dueDate" class="form-input" />
      </div>

      <div class="setting-group" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;" @click="notify = !notify">
        <label style="margin-bottom: 0; cursor: pointer;">是否开启通知</label>
        <div class="toggle-switch" :class="{ active: notify }">
          <div class="toggle-knob"></div>
        </div>
      </div>

      <div style="margin-top: 24px; display: flex; justify-content: flex-end; gap: 12px;">
        <button class="cancel-btn" @click="emit('close')">取消</button>
        <button class="save-btn" @click="handleSave">{{ initialTask ? '保存修改' : '确认新建' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s;
  background-color: var(--bg-main);
  color: var(--text-main);
  font-family: inherit;
}
.form-input:focus {
  border-color: var(--primary-color);
}
/* Style the native calendar icon */
input[type="datetime-local"]::-webkit-calendar-picker-indicator {
  cursor: pointer;
  background-image: none !important; /* Remove the native browser icon completely */
  color: transparent;
  background-color: var(--primary-color);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Cline x1='16' y1='2' x2='16' y2='6'%3E%3C/line%3E%3Cline x1='8' y1='2' x2='8' y2='6'%3E%3C/line%3E%3Cline x1='3' y1='10' x2='21' y2='10'%3E%3C/line%3E%3C/svg%3E") center/contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Cline x1='16' y1='2' x2='16' y2='6'%3E%3C/line%3E%3Cline x1='8' y1='2' x2='8' y2='6'%3E%3C/line%3E%3Cline x1='3' y1='10' x2='21' y2='10'%3E%3C/line%3E%3C/svg%3E") center/contain no-repeat;
  width: 18px;
  height: 18px;
  padding: 2px;
  transition: background-color 0.2s;
}
input[type="datetime-local"]::-webkit-calendar-picker-indicator:hover {
  background-color: var(--primary-hover);
}
.toggle-switch {
  width: 44px;
  height: 24px;
  background-color: #cbd5e1;
  border-radius: 12px;
  position: relative;
  transition: background-color 0.2s;
}
.toggle-switch.active {
  background-color: var(--primary-color);
}
.toggle-knob {
  width: 20px;
  height: 20px;
  background-color: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.toggle-switch.active .toggle-knob {
  transform: translateX(20px);
}
.cancel-btn {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  color: var(--text-secondary);
  transition: background-color 0.2s;
}
.cancel-btn:hover {
  background-color: var(--bg-sidebar);
}
.save-btn {
  padding: 8px 20px;
  background-color: var(--primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
}
.save-btn:hover {
  background-color: var(--primary-hover);
}
</style>
