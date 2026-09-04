<script setup lang="ts">
import { ref, watch } from 'vue';
import { selectFolder } from '../utils/filePicker';
import { parsePathDisplay } from '../utils/pathUtils';

const props = defineProps<{ 
  show: boolean;
  initialTask?: { title: string; category?: string; dueDate?: string; priority?: number; gitUrl?: string } | null;
}>();
const emit = defineEmits<{ 
  (e: 'close'): void;
  (e: 'save', taskData: { title: string; category?: string; dueDate: string; gitUrl?: string }): void;
}>();

const title = ref('');
const category = ref('');
const gitUrl = ref('');
const titleError = ref('');
const dateTimeError = ref('');
const dateTime = ref('');

const handleSelectFolder = async () => {
  const folder = await selectFolder();
  if (folder) {
    gitUrl.value = folder;
  }
};

watch(() => props.show, (newVal) => {
  if (newVal) {
    titleError.value = '';
    dateTimeError.value = '';
    if (props.initialTask) {
      title.value = props.initialTask.title;
      category.value = props.initialTask.category || '';
      gitUrl.value = props.initialTask.gitUrl || '';
      dateTime.value = props.initialTask.dueDate ? props.initialTask.dueDate.substring(0, 16) : '';
    } else {
      title.value = '';
      category.value = '';
      gitUrl.value = '';
      dateTime.value = '';
    }
  }
});

const dateInputRef = ref<HTMLInputElement | null>(null);

const triggerDatePicker = () => {
  if (dateInputRef.value && typeof dateInputRef.value.showPicker === 'function') {
    try {
      dateInputRef.value.showPicker();
    } catch (e) {}
  }
};

const handleSave = () => {
  let hasError = false;
  if (!title.value.trim()) {
    titleError.value = '请输入任务名称';
    hasError = true;
  }
  if (!dateTime.value) {
    dateTimeError.value = '请选择截止时间';
    hasError = true;
  }
  
  if (hasError) return;
  
  emit('save', {
    title: title.value.trim(),
    category: category.value.trim() || undefined,
    gitUrl: gitUrl.value.trim() || undefined,
    dueDate: dateTime.value,
  });
};
</script>

<template>
  <div v-if="show" class="modal-overlay">
    <div class="modal-wrapper">
      
      <!-- Header -->
      <div class="modal-header-section">
        <div class="header-left">
          <div class="header-icon-box">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
          </div>
          <div class="header-texts">
            <h2>{{ initialTask ? '编辑任务' : '新建任务' }}</h2>
            <p>{{ initialTask ? '修改任务详情与截止时间' : '记录你的待办事项与截止时间' }}</p>
          </div>
        </div>
        <button class="close-btn" @click="emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <!-- Body Form -->
      <div class="modal-body-form">
        <!-- Title Input Card -->
        <div class="card title-card">
          <input 
            type="text" 
            placeholder="准备做什么？" 
            v-model="title" 
            @input="titleError = ''"
            :class="{ 'has-error': titleError }"
          />
          <span v-if="titleError" class="error-msg">{{ titleError }}</span>
        </div>

        <!-- Category & Project Folder Cards -->
        <div class="form-row">
          <!-- Category Card -->
          <div class="card row-card">
            <div class="card-title">
              <svg class="green-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
              <span>分类</span>
            </div>
            <input type="text" placeholder="输入或选择分类" v-model="category" />
          </div>

          <!-- Project Folder Card -->
          <div class="card row-card">
            <div class="card-title">
              <svg class="green-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
              <span>关联项目目录 (Git)</span>
            </div>
            <div class="modal-folder-trigger" @click="handleSelectFolder" :title="gitUrl ? `代码路径: ${gitUrl}` : '点击选择文件夹'">
              <span class="modal-folder-name" :class="{ placeholder: !gitUrl }">
                {{ gitUrl ? (parsePathDisplay(gitUrl).projectName || gitUrl) : '点击选择文件夹...' }}
              </span>
              <button v-if="gitUrl" type="button" class="modal-clear-btn" @click.stop="gitUrl = ''" title="清除路径">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Date Card -->
        <div class="card date-card">
          <div class="card-title">
            <svg class="green-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            <span>截止时间 <span class="required">*</span></span>
          </div>
          <div class="date-picker-box" :class="{ 'has-error': dateTimeError }" @click="triggerDatePicker" style="cursor: pointer; padding-left: 12px; position: relative; display: flex; align-items: center;">
            <svg class="small-icon" style="margin-right: 8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            <span class="date-text" :class="{ 'has-value': dateTime }">
              {{ dateTime ? dateTime.replace('T', ' ') : '选择日期和时间' }}
            </span>
            <input type="datetime-local" ref="dateInputRef" v-model="dateTime" @input="dateTimeError = ''" class="overlay-input" style="pointer-events: none;" />
          </div>
          <span v-if="dateTimeError" class="error-msg">{{ dateTimeError }}</span>
        </div>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button class="btn-cancel" @click="emit('close')">取消</button>
        <button class="btn-confirm" @click="handleSave">{{ initialTask ? '保存修改' : '确认新建' }}</button>
      </div>
      
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-wrapper {
  background-color: var(--bg-sidebar);
  width: 90%;
  max-width: 580px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  font-family: inherit;
  overflow: hidden;
}
.modal-header-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 24px 32px 16px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.header-icon-box {
  background-color: var(--primary-color);
  color: #fff;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
}
.header-titles h2 {
  margin: 0 0 4px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-main);
}
.header-titles p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.close-btn {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}
.close-btn:hover {
  background: var(--bg-sidebar);
  color: var(--text-main);
}

.modal-body {
  padding: 0 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  flex: 1;
}

.card {
  background: var(--bg-main);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}

.card-title .required {
  color: var(--danger-color);
}

.optional-tag {
  font-size: 11.5px;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: 2px;
}

.input-container {
  display: flex;
  align-items: center;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0 16px;
  height: 48px;
  background: var(--bg-main);
  transition: all 0.2s;
}
.input-container:focus-within {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px var(--primary-light);
}
.input-container.has-error {
  border-color: var(--danger-color);
}
.input-container input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 14px;
  color: var(--text-main);
  background: transparent;
}
.input-container input::placeholder {
  color: var(--text-muted);
}
.char-count {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: 12px;
}
.error-msg {
  display: block;
  color: var(--danger-color);
  font-size: 12px;
  margin-top: 8px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}
.green-icon {
  width: 18px;
  height: 18px;
  color: var(--primary-color);
}

.date-picker-box {
  display: flex;
  align-items: center;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  height: 44px;
  transition: all 0.2s;
}
.date-picker-box:focus-within {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px var(--primary-light);
}
.date-picker-box.has-error {
  border-color: var(--danger-color);
}
.date-text {
  font-size: 13px;
  color: var(--text-muted);
}
.date-text.has-value {
  color: var(--text-main);
}
.small-icon {
  width: 16px;
  height: 16px;
  color: var(--text-muted);
}
.overlay-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.row-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
}
.row-card .card-title {
  margin: 0;
}

.modal-folder-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0 12px;
  height: 40px;
  background: var(--bg-main);
  transition: all 0.2s;
  width: 140px;
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
}

.modal-folder-trigger:hover {
  border-color: var(--primary-color);
  background-color: var(--bg-sidebar);
}

.modal-folder-name {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.modal-folder-name.placeholder {
  color: var(--text-muted);
  font-weight: 400;
}

.modal-clear-btn {
  background: transparent;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3px;
  border-radius: 50%;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}

.modal-clear-btn:hover {
  color: var(--danger-color);
  background-color: rgba(239, 68, 68, 0.15);
}
.custom-dropdown {
  position: relative;
  width: 140px;
  outline: none;
}
.dropdown-selected {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-main);
  font-size: 14px;
  color: var(--text-main);
  cursor: pointer;
  transition: all 0.2s;
}
.custom-dropdown:focus-within .dropdown-selected,
.dropdown-selected:hover {
  border-color: var(--primary-color);
}
.select-arrow {
  width: 16px;
  height: 16px;
  color: var(--text-muted);
  transition: transform 0.2s;
}
.select-arrow.open {
  transform: rotate(180deg);
}
.dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  width: 100%;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  z-index: 10;
  animation: dropDown 0.2s ease-out;
}
@keyframes dropDown {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.dropdown-item {
  padding: 10px 16px;
  font-size: 14px;
  color: var(--text-main);
  cursor: pointer;
  transition: background 0.2s;
}
.dropdown-item:hover {
  background: var(--bg-sidebar);
}
.dropdown-item.selected {
  color: var(--primary-color);
  background: var(--primary-light);
  font-weight: 500;
}

.modal-footer {
  padding: 24px 32px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
.btn-cancel, .btn-confirm {
  padding: 0 24px;
  height: 40px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-cancel {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  color: var(--text-main);
}
.btn-cancel:hover {
  background: var(--bg-sidebar);
}
.btn-confirm {
  background: var(--primary-color);
  border: none;
  color: #fff;
}
.btn-confirm:hover {
  background: var(--primary-hover);
}

/* Dark Mode Overrides for proper contrast */
:global(.dark) .modal-wrapper {
  background-color: var(--bg-main);
}
:global(.dark) .card {
  background-color: var(--bg-sidebar);
}
:global(.dark) .input-container,
:global(.dark) .dropdown-selected,
:global(.dark) .dropdown-menu {
  background-color: var(--bg-main);
}
:global(.dark) .dropdown-menu {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}
:global(.dark) .close-btn,
:global(.dark) .btn-cancel {
  background-color: var(--bg-main);
}
:global(.dark) .close-btn:hover,
:global(.dark) .btn-cancel:hover {
  background-color: var(--border-color);
}
</style>
