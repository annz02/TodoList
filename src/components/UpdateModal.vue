<script setup lang="ts">
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { UpdateInfo } from '../composables/useUpdate';

const props = defineProps<{
  show: boolean;
  currentVersion: string;
  updateInfo: UpdateInfo | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'viewChangelog'): void;
}>();

const isDownloading = ref(false);
const isInstalling = ref(false);
const downloadPercent = ref(0);
const downloadError = ref('');

const handleStartUpdate = async () => {
  if (!props.updateInfo?.downloadUrl && !props.updateInfo?.url) return;
  
  const targetUrl = props.updateInfo.downloadUrl || props.updateInfo.url;
  
  const isBinary = targetUrl.endsWith('.exe') || targetUrl.endsWith('.msi') || targetUrl.endsWith('.zip') || targetUrl.endsWith('.dmg');
  if (!isBinary) {
    try {
      await invoke('open_url', { url: targetUrl });
    } catch {
      window.open(targetUrl, '_blank');
    }
    return;
  }

  isDownloading.value = true;
  downloadPercent.value = 0;
  downloadError.value = '';

  try {
    const res = await fetch(targetUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const total = parseInt(res.headers.get('content-length') || '0', 10);
    const reader = res.body?.getReader();

    if (!reader) throw new Error('网络流读取失败');

    let loaded = 0;
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (total > 0) {
        downloadPercent.value = Math.min(99, Math.round((loaded / total) * 100));
      }
    }

    downloadPercent.value = 100;
    isInstalling.value = true;

    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const fileName = targetUrl.substring(targetUrl.lastIndexOf('/') + 1) || 'Todolist_Setup.exe';

    await invoke('run_installer', { bytes: Array.from(combined), fileName });
  } catch (err: any) {
    console.error('Download update error:', err);
    downloadError.value = '应用内下载失败，正在转至浏览器下载...';
    setTimeout(async () => {
      try {
        await invoke('open_url', { url: targetUrl });
      } catch {
        window.open(targetUrl, '_blank');
      }
      isDownloading.value = false;
      isInstalling.value = false;
    }, 1500);
  }
};
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="modal-overlay" @click.self="!isDownloading && !isInstalling && emit('close')">
      <div class="update-modal-card">
        <!-- 头部图标与版本变化 -->
        <div class="update-header">
          <div class="update-icon-wrapper">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </div>
          <div class="update-header-info">
            <div class="update-title">发现新版本！</div>
            <div class="version-badges">
              <span class="badge old-badge">v{{ currentVersion }}</span>
              <svg class="arrow-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
              <span class="badge new-badge">v{{ updateInfo?.version }}</span>
            </div>
          </div>
        </div>

        <!-- 更新日志内容 -->
        <div class="update-body">
          <div class="notes-header">
            <span class="notes-title">更新日志：</span>
            <span v-if="updateInfo?.releaseDate" class="release-date">{{ updateInfo.releaseDate }}</span>
          </div>
          <div class="notes-content custom-scrollbar">
            <pre v-if="updateInfo?.notes && updateInfo.notes.trim()">{{ updateInfo.notes }}</pre>
            <p v-else class="empty-notes">包含最新的功能优化与性能提升，建议升级体验。</p>
          </div>
        </div>

        <!-- 下载与安装进度条 -->
        <div v-if="isDownloading || isInstalling" class="progress-section">
          <div class="progress-info">
            <span>{{ isInstalling ? '下载完成，正在启动安装程序...' : '正在在应用内下载更新包...' }}</span>
            <span v-if="!isInstalling && downloadPercent > 0">{{ downloadPercent }}%</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" :style="{ width: isInstalling ? '100%' : `${Math.max(downloadPercent, 5)}%` }"></div>
          </div>
          <div v-if="downloadError" class="progress-error">{{ downloadError }}</div>
        </div>

        <!-- 底部按钮操作区 -->
        <div class="update-footer">
          <button type="button" class="btn btn-text" :disabled="isDownloading || isInstalling" @click="emit('viewChangelog')">
            查看完整 Changelog
          </button>
          <div class="footer-actions">
            <button type="button" class="btn btn-secondary" :disabled="isDownloading || isInstalling" @click="emit('close')">
              暂不更新
            </button>
            <button type="button" class="btn btn-primary" :disabled="isDownloading || isInstalling" @click="handleStartUpdate">
              <span v-if="isInstalling">启动安装中...</span>
              <span v-else-if="isDownloading">下载中 {{ downloadPercent > 0 ? downloadPercent + '%' : '' }}</span>
              <span v-else>立即更新</span>
            </button>
          </div>
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
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.update-modal-card {
  width: 440px;
  max-width: 90vw;
  background: var(--bg-main, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 16px;
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.25);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  animation: modalPop 0.26s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalPop {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.update-header {
  display: flex;
  align-items: center;
  gap: 16px;
}

.update-icon-wrapper {
  width: 50px;
  height: 50px;
  border-radius: 14px;
  background: var(--primary-light, rgba(59, 130, 246, 0.12));
  color: var(--primary-color, #3b82f6);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.update-header-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.update-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-main, #1f2937);
}

.version-badges {
  display: flex;
  align-items: center;
  gap: 8px;
}

.arrow-icon {
  color: var(--text-muted, #9ca3af);
}

.badge {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
}

.old-badge {
  background: var(--bg-sidebar, #f3f4f6);
  color: var(--text-muted, #6b7280);
}

.new-badge {
  background: var(--primary-color, #3b82f6);
  color: #ffffff;
}

.update-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.notes-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-main, #374151);
}

.release-date {
  font-size: 0.8rem;
  color: var(--text-muted, #9ca3af);
}

.notes-content {
  background: var(--bg-sidebar, #f9fafb);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 14px;
  max-height: 180px;
  overflow-y: auto;
  font-size: 0.86rem;
  color: var(--text-main, #4b5563);
  line-height: 1.55;
}

.notes-content pre {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  margin: 0;
}

.empty-notes {
  margin: 0;
  color: var(--text-muted, #9ca3af);
}

.progress-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  animation: fadeIn 0.2s ease-in;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--primary-color, #3b82f6);
}

.progress-bar-bg {
  width: 100%;
  height: 7px;
  background: var(--bg-sidebar, #e5e7eb);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--primary-color, #3b82f6);
  border-radius: 4px;
  transition: width 0.2s ease;
}

.progress-error {
  font-size: 0.8rem;
  color: #ef4444;
  margin-top: 2px;
}

.update-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn {
  padding: 9px 16px;
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
  border: none;
}

.btn-text {
  background: transparent;
  color: var(--primary-color, #3b82f6);
  padding: 0;
  font-size: 0.82rem;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.btn-text:hover {
  opacity: 0.85;
}

.btn-secondary {
  background: var(--bg-sidebar, #f3f4f6);
  color: var(--text-secondary, #4b5563);
}

.btn-secondary:hover {
  background: var(--border-color, #e5e7eb);
  color: var(--text-main, #1f2937);
}

.btn-primary {
  background: var(--primary-color, #3b82f6);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
}

.btn-primary:hover {
  opacity: 0.92;
  transform: translateY(-1px);
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.24s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
