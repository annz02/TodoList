<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const changelogContent = ref<string>('');
const isLoading = ref<boolean>(false);

const REPO_OWNER = 'annz02';
const REPO_NAME = 'TodoList-Ann';

const fetchChangelog = async () => {
  isLoading.value = true;
  try {
    const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/CHANGELOG.md`;
    const res = await fetch(url);
    if (res.ok) {
      changelogContent.value = await res.text();
    } else {
      changelogContent.value = '暂无法加载远程更新日志，请访问 GitHub 查看。';
    }
  } catch {
    changelogContent.value = '加载更新日志失败，请检查网络连接。';
  } finally {
    isLoading.value = false;
  }
};

watch(() => props.show, (newVal) => {
  if (newVal) {
    fetchChangelog();
  }
});
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="modal-overlay" @click.self="emit('close')">
      <div class="changelog-card">
        <div class="changelog-header">
          <div class="header-left">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <span class="header-title">更新日志 (CHANGELOG)</span>
          </div>
          <button type="button" class="close-btn" @click="emit('close')" title="关闭">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="changelog-body custom-scrollbar">
          <div v-if="isLoading" class="loading-state">
            <svg class="spin-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="12" y1="2" x2="12" y2="6"></line>
              <line x1="12" y1="18" x2="12" y2="22"></line>
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
              <line x1="2" y1="12" x2="6" y2="12"></line>
              <line x1="18" y1="12" x2="22" y2="12"></line>
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
            </svg>
            <span>加载更新日志中...</span>
          </div>

          <pre v-else class="markdown-content">{{ changelogContent }}</pre>
        </div>

        <div class="changelog-footer">
          <button type="button" class="btn btn-primary" @click="emit('close')">
            确定
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.changelog-card {
  width: 520px;
  max-width: 90vw;
  max-height: 80vh;
  background: var(--bg-main, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 16px;
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: cardPop 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes cardPop {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.changelog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--primary-color, #3b82f6);
}

.header-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main, #1f2937);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted, #9ca3af);
  cursor: pointer;
  border-radius: 6px;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
}

.close-btn:hover {
  background: var(--bg-sidebar, #f3f4f6);
  color: var(--text-main, #1f2937);
}

.changelog-body {
  flex: 1;
  padding: 20px 22px;
  overflow-y: auto;
  min-height: 200px;
  max-height: 480px;
  background: var(--bg-sidebar, #f9fafb);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 0;
  color: var(--text-muted, #9ca3af);
  font-size: 0.9rem;
}

.spin-icon {
  animation: spin 1.2s linear infinite;
  color: var(--primary-color, #3b82f6);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.markdown-content {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--text-main, #374151);
  margin: 0;
}

.changelog-footer {
  padding: 14px 22px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-main, #ffffff);
}

.btn {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
  border: none;
}

.btn-primary {
  background: var(--primary-color, #3b82f6);
  color: #ffffff;
}

.btn-primary:hover {
  opacity: 0.92;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.22s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
