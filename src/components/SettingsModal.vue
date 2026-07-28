<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getVersion } from '@tauri-apps/api/app';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useTheme } from '../composables/useTheme';
import UpdateModal from './UpdateModal.vue';

defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { primaryColor, themeColors, setPrimaryColor, themeMode, setThemeMode } = useTheme();
const activeTab = ref<'general' | 'shortcuts'>('general');

const colorNames: Record<string, string> = {
  '#3b82f6': '经典蓝',
  '#6366f1': '罗兰紫',
  '#10b981': '翡翠绿',
  '#f59e0b': '琥珀橙',
  '#ec4899': '玫瑰粉',
};

const appVersion = ref('');
const isCheckingUpdate = ref(false);
const updateStatusMsg = ref('');
let updateStatusTimer: ReturnType<typeof setTimeout> | null = null;

// 新版本更新弹窗状态
const showUpdateModal = ref(false);
const pendingUpdate = ref<Update | null>(null);
const isDownloading = ref(false);
const isInstalling = ref(false);
const downloadPercent = ref(0);

onMounted(async () => {
  try {
    appVersion.value = await getVersion();
  } catch {
    appVersion.value = '0.1.2';
  }
});

const scheduleStatusClear = () => {
  if (updateStatusTimer) clearTimeout(updateStatusTimer);
  updateStatusTimer = setTimeout(() => {
    updateStatusMsg.value = '';
  }, 5000);
};

const handleCheckUpdate = async () => {
  if (updateStatusTimer) {
    clearTimeout(updateStatusTimer);
    updateStatusTimer = null;
  }
  isCheckingUpdate.value = true;
  updateStatusMsg.value = '';
  try {
    const update = await check();
    if (update) {
      pendingUpdate.value = update;
      showUpdateModal.value = true;
    } else {
      updateStatusMsg.value = '当前已是最新版本';
      scheduleStatusClear();
    }
  } catch (e: any) {
    const msg = e.message || String(e);
    if (msg.includes('cancel')) {
      updateStatusMsg.value = '更新已取消';
      scheduleStatusClear();
    } else if (msg.includes('Could not fetch a valid release JSON') || msg.includes('404')) {
      updateStatusMsg.value = '当前已是最新版本';
      scheduleStatusClear();
    } else {
      updateStatusMsg.value = '检查更新失败: ' + msg;
      scheduleStatusClear();
    }
  } finally {
    isCheckingUpdate.value = false;
  }
};

const handleConfirmUpdate = async () => {
  if (!pendingUpdate.value) return;
  isDownloading.value = true;
  isInstalling.value = false;
  downloadPercent.value = 0;

  let downloaded = 0;
  let contentLength = 0;

  try {
    await pendingUpdate.value.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        contentLength = event.data.contentLength || 0;
      } else if (event.event === 'Progress') {
        downloaded += event.data.chunkLength;
        if (contentLength > 0) {
          downloadPercent.value = Math.round((downloaded / contentLength) * 100);
        }
      } else if (event.event === 'Finished') {
        isInstalling.value = true;
      }
    });
    await relaunch();
  } catch (e: any) {
    showUpdateModal.value = false;
    updateStatusMsg.value = '下载更新失败: ' + (e.message || String(e));
    scheduleStatusClear();
  } finally {
    isDownloading.value = false;
    isInstalling.value = false;
  }
};
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-card">
        <!-- 左侧侧边导航 -->
        <aside class="settings-nav">
          <div class="nav-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            <span>设置</span>
          </div>

          <nav class="nav-menu">
            <button 
              type="button"
              class="nav-item" 
              :class="{ active: activeTab === 'general' }" 
              @click.stop="activeTab = 'general'"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4l3 3"></path></svg>
              通用
            </button>
            <button 
              type="button"
              class="nav-item" 
              :class="{ active: activeTab === 'shortcuts' }" 
              @click.stop="activeTab = 'shortcuts'"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M18 12h.01M8 16h8"></path></svg>
              快捷键
            </button>
          </nav>
        </aside>

        <!-- 右侧主内容区域 -->
        <main class="settings-content">
          <div class="content-header">
            <h2 class="content-title">{{ activeTab === 'general' ? '通用设置' : '快捷键说明' }}</h2>
            <button type="button" class="close-icon-btn" @click.stop="emit('close')" title="关闭">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <div class="content-body">
            <!-- 通用页签内容 -->
            <div v-if="activeTab === 'general'" class="tab-panel general-panel">
              <!-- 深色模式设置 -->
              <div class="setting-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <span class="card-title" style="margin:0;">深色模式</span>
                  </div>
                  <div 
                    class="toggle-switch" 
                    :class="{ active: themeMode === 'dark' }" 
                    @click.stop="setThemeMode(themeMode === 'dark' ? 'light' : 'dark')"
                  >
                    <div class="toggle-knob"></div>
                  </div>
                </div>
              </div>

              <!-- 主题颜色设置 -->
              <div class="setting-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <span class="card-title" style="margin:0;">主题色</span>
                  </div>
                  
                  <div class="color-palette">
                    <button 
                      type="button"
                      v-for="color in themeColors" 
                      :key="color"
                      class="color-btn"
                      :class="{ active: primaryColor === color }"
                      :style="{ backgroundColor: color }"
                      :title="colorNames[color] || color"
                      @click.stop="setPrimaryColor(color)"
                    >
                      <svg v-if="primaryColor === color" class="check-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <!-- 版本与更新 -->
              <div class="setting-card update-card" :class="{ 'expanded': updateStatusMsg }">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="info-text">
                      <span class="card-title">版本更新</span>
                      <span class="card-desc">当前版本 v{{ appVersion }}</span>
                      <span v-if="updateStatusMsg" class="update-status-msg">{{ updateStatusMsg }}</span>
                    </div>
                  </div>
                  <button type="button" class="update-check-btn" :disabled="isCheckingUpdate" @click.stop="handleCheckUpdate">
                    <svg v-if="!isCheckingUpdate" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="23 4 23 10 17 10"></polyline>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    <span>{{ isCheckingUpdate ? '检查中...' : '检查更新' }}</span>
                  </button>
                </div>
              </div>
            </div>
            <!-- 快捷键页签内容 -->
            <div v-if="activeTab === 'shortcuts'" class="tab-panel shortcuts-panel">
              <div class="setting-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="info-text">
                      <span class="card-title">新建任务</span>
                      <span class="card-desc">呼出新建任务卡片</span>
                    </div>
                  </div>
                  <div class="key-caps">
                    <kbd class="key-cap">Ctrl</kbd>
                    <span class="plus">+</span>
                    <kbd class="key-cap">N</kbd>
                  </div>
                </div>
              </div>

              <div class="setting-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="info-text">
                      <span class="card-title">保存任务</span>
                      <span class="card-desc">保存新建卡片或修改内容</span>
                    </div>
                  </div>
                  <div class="key-caps">
                    <kbd class="key-cap">Ctrl</kbd>
                    <span class="plus">+</span>
                    <kbd class="key-cap">S</kbd>
                  </div>
                </div>
              </div>

              <div class="setting-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="info-text">
                      <span class="card-title">编辑任务</span>
                      <span class="card-desc">编辑选中的任务卡片</span>
                    </div>
                  </div>
                  <div class="key-caps">
                    <kbd class="key-cap">Ctrl</kbd>
                    <span class="plus">+</span>
                    <kbd class="key-cap">E</kbd>
                  </div>
                </div>
              </div>

              <div class="setting-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="info-text">
                      <span class="card-title">删除任务</span>
                      <span class="card-desc">删除选中的任务卡片</span>
                    </div>
                  </div>
                  <div class="key-caps">
                    <kbd class="key-cap">Ctrl</kbd>
                    <span class="plus">+</span>
                    <kbd class="key-cap">D</kbd>
                  </div>
                </div>
              </div>

              <div class="setting-card">
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="info-text">
                      <span class="card-title">取消操作</span>
                      <span class="card-desc">取消新建或编辑任务</span>
                    </div>
                  </div>
                  <div class="key-caps">
                    <kbd class="key-cap">Ctrl</kbd>
                    <span class="plus">+</span>
                    <kbd class="key-cap">W</kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  </Transition>

  <!-- 新版本更新对话框 -->
  <UpdateModal
    :show="showUpdateModal"
    :version="pendingUpdate?.version || ''"
    :current-version="appVersion"
    :body="pendingUpdate?.body || ''"
    :date="pendingUpdate?.date || ''"
    :is-downloading="isDownloading"
    :is-installing="isInstalling"
    :download-percent="downloadPercent"
    @confirm="handleConfirmUpdate"
    @close="showUpdateModal = false"
  />
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-card {
  width: 580px;
  height: 480px;
  max-height: 85vh;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  display: flex;
  overflow: hidden;
  box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.3);
  animation: cardPop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes cardPop {
  from { transform: scale(0.96); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* 左侧 Sidebar Nav */
.settings-nav {
  width: 160px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.nav-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 20px;
  padding: 0 6px;
}

.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border-radius: 9px;
  border: none;
  background: transparent;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;
}

.nav-item:hover:not(.active) {
  background: var(--bg-main);
  color: var(--text-main);
}

.nav-item.active {
  background: var(--primary-light);
  color: var(--primary-color);
  font-weight: 600;
}

/* 右侧 Main Content */
.settings-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px 24px;
  overflow-y: auto;
}

.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.content-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
}

.close-icon-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 6px;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
}

.close-icon-btn:hover {
  background: var(--bg-sidebar);
  color: var(--text-main);
}

.tab-panel {
  animation: panelFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.general-panel,
.shortcuts-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@keyframes panelFade {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Setting Card Design */
.setting-card {
  background: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.general-panel .setting-card,
.shortcuts-panel .setting-card {
  height: 64px;
  min-height: 64px;
  padding: 0 20px;
  justify-content: center;
  gap: 0;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.setting-info {
  display: flex;
  align-items: center;
}

.info-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.toggle-switch {
  width: 44px;
  height: 24px;
  background: var(--border-color);
  border-radius: 12px;
  position: relative;
  cursor: pointer;
  transition: background-color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-switch.active {
  background-color: var(--primary-color);
}

.toggle-knob {
  width: 18px;
  height: 18px;
  background: #ffffff;
  border-radius: 50%;
  position: absolute;
  top: 3px;
  left: 3px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-switch.active .toggle-knob {
  transform: translateX(20px);
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 2px;
  line-height: 1.2;
}

.card-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.2;
}

/* Color Palette */
.color-palette {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 4px;
}

.color-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.color-btn:hover {
  transform: scale(1.12);
}

.color-btn.active {
  transform: scale(1.18);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
}

.check-icon {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
  animation: checkPop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes checkPop {
  from {
    transform: scale(0.3) rotate(-15deg);
    opacity: 0;
  }
  to {
    transform: scale(1) rotate(0);
    opacity: 1;
  }
}

/* Shortcut Items */
.key-caps {
  display: flex;
  align-items: center;
  gap: 4px;
}

.key-cap {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 0 var(--border-color);
  border-radius: 6px;
  padding: 4px 9px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
}

.plus {
  font-size: 12px;
  color: var(--text-muted);
  padding: 0 2px;
}


.update-check-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--primary-color);
  border-radius: 8px;
  background: transparent;
  color: var(--primary-color);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
}

.update-check-btn:hover:not(:disabled) {
  background: var(--primary-light);
}

.update-check-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.general-panel .setting-card.update-card {
  transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.general-panel .setting-card.update-card.expanded {
  height: auto;
  min-height: 82px;
  padding: 12px 20px;
}

.update-status-msg {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  font-weight: 500;
  color: var(--primary-color);
  animation: fadeIn 0.25s ease-in-out;
}
</style>
