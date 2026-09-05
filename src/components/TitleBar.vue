<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { EVENTS } from '../events';

defineProps<{
  title?: string;
}>();

const isMaximized = ref(false);
const isStickyVisible = ref(true);
let unlistenStickyVis: (() => void) | null = null;

const minimizeWindow = () => getCurrentWindow().minimize();
const toggleMaximize = async () => {
  await getCurrentWindow().toggleMaximize();
  isMaximized.value = await getCurrentWindow().isMaximized();
};
const closeWindow = () => getCurrentWindow().close();

const toggleSticky = async () => {
  try {
    const isVis = await invoke<boolean>('get_sticky_visible');
    if (!isVis) {
      await invoke('set_sticky_visible', { visible: true });
      isStickyVisible.value = true;
    }
    await emit('toggle-sticky-state');
  } catch (e) {
    console.warn('Failed to toggle sticky window:', e);
  }
};


onMounted(async () => {
  try {
    isMaximized.value = await getCurrentWindow().isMaximized();
    await getCurrentWindow().onResized(async () => {
      isMaximized.value = await getCurrentWindow().isMaximized();
    });
  } catch (e) {
    console.error('Failed to get window state in TitleBar:', e);
  }

  try {
    isStickyVisible.value = await invoke<boolean>('get_sticky_visible');
  } catch (e) {
    console.warn('Failed to get sticky visible status:', e);
  }

  try {
    unlistenStickyVis = await listen<boolean>(
      EVENTS.stickyVisibilityChanged,
      (ev) => {
        if (typeof ev.payload === 'boolean') {
          isStickyVisible.value = ev.payload;
        }
      }
    );
  } catch (e) {
    console.warn('Failed to listen sticky visibility changed:', e);
  }
});

onUnmounted(() => {
  if (unlistenStickyVis) {
    unlistenStickyVis();
  }
});
</script>

<template>
  <header class="app-titlebar" data-tauri-drag-region @dblclick="toggleMaximize">
    <!-- Left: App Logo & App Name -->
    <div class="titlebar-left" data-tauri-drag-region>
      <img src="/logo.png" alt="Logo" class="app-icon" />
      <span class="app-title-text">{{ title || 'Todolist' }}</span>
    </div>

    <!-- Center / Filler drag region -->
    <div class="titlebar-center" data-tauri-drag-region></div>

    <!-- Right: Window Caption Buttons (Windows Native Style) -->
    <div class="titlebar-controls">
      <!-- Desktop Sticky Toggle Button -->
      <button
        @click.stop="toggleSticky"
        class="sticky-toggle-btn"
        :class="{ active: isStickyVisible }"
        :title="isStickyVisible ? '点击隐藏桌面悬浮便签栏' : '点击显示桌面悬浮便签栏'"
        tabindex="-1"
      >
        <svg class="sticky-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="3"></rect>
          <line x1="9" y1="7" x2="15" y2="7"></line>
          <line x1="9" y1="12" x2="15" y2="12"></line>
        </svg>
        <span class="sticky-btn-text">桌面便签</span>
        <span class="sticky-dot" :class="{ on: isStickyVisible }"></span>
      </button>

      <button @click.stop="minimizeWindow" class="win-btn" title="最小化" tabindex="-1">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" stroke-width="1"></line>
        </svg>
      </button>
      <button @click.stop="toggleMaximize" class="win-btn" :title="isMaximized ? '向下还原' : '最大化'" tabindex="-1">
        <svg v-if="isMaximized" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M2.5 7.5H0.5V0.5H7.5V2.5"></path>
          <rect x="2.5" y="2.5" width="7" height="7"></rect>
        </svg>
        <svg v-else width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1">
          <rect x="0.5" y="0.5" width="9" height="9"></rect>
        </svg>
      </button>
      <button @click.stop="closeWindow" class="win-btn close-win-btn" title="关闭" tabindex="-1">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" stroke="currentColor" stroke-width="1"></line>
          <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" stroke="currentColor" stroke-width="1"></line>
        </svg>
      </button>
    </div>
  </header>
</template>


<style scoped>
.app-titlebar {
  height: 32px;
  min-height: 32px;
  width: 100%;
  background-color: var(--bg-titlebar, #f8fafc);
  color: var(--text-titlebar, #334155);
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
  -webkit-user-select: none;
  border-bottom: 1px solid var(--border-titlebar, #e2e8f0);
  box-sizing: border-box;
  flex-shrink: 0;
  z-index: 9999;
}

:global(.dark) .app-titlebar {
  --bg-titlebar: #12151b;
  --text-titlebar: #e2e8f0;
  --border-titlebar: #232836;
}

.titlebar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  height: 100%;
  pointer-events: none;
}

.app-icon {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  object-fit: contain;
}

.app-title-text {
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.3px;
}

.titlebar-center {
  flex: 1;
  height: 100%;
}

.titlebar-controls {
  display: flex;
  align-items: stretch;
  height: 100%;
  -webkit-app-region: no-drag;
}

.win-btn {
  background: transparent;
  border: none;
  width: 46px;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0;
  color: inherit;
  opacity: 0.8;
  cursor: default;
  transition: background-color 0.12s ease, opacity 0.12s ease;
  user-select: none;
  -webkit-user-select: none;
  padding: 0;
}

.win-btn:hover {
  background-color: rgba(128, 128, 128, 0.15);
  opacity: 1;
}

.win-btn:active {
  background-color: rgba(128, 128, 128, 0.25);
}

.close-win-btn:hover {
  background-color: #e81123 !important;
  color: #ffffff !important;
  opacity: 1;
}

.close-win-btn:active {
  background-color: #bf0f1d !important;
  color: #ffffff !important;
}

/* Sticky notes toggle button */
.sticky-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  margin: auto 8px auto 0;
  border-radius: 11px;
  border: 1px solid var(--border-sticky-btn, rgba(0, 0, 0, 0.1));
  background-color: var(--bg-sticky-btn, rgba(0, 0, 0, 0.03));
  color: var(--text-titlebar, #475569);
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  -webkit-user-select: none;
}

.sticky-toggle-btn:hover {
  background-color: var(--bg-sticky-btn-hover, rgba(0, 0, 0, 0.07));
  color: #0f172a;
  border-color: rgba(0, 0, 0, 0.18);
}

.sticky-toggle-btn.active {
  background-color: rgba(16, 185, 129, 0.09);
  color: #059669;
  border-color: rgba(16, 185, 129, 0.32);
}

.sticky-toggle-btn.active:hover {
  background-color: rgba(16, 185, 129, 0.16);
  border-color: rgba(16, 185, 129, 0.45);
}

.sticky-btn-text {
  line-height: 1;
}

.sticky-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #cbd5e1;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
  flex-shrink: 0;
}

.sticky-dot.on {
  background-color: #10b981;
  box-shadow: 0 0 5px rgba(16, 185, 129, 0.55);
}

:global(.dark) .sticky-toggle-btn {
  --border-sticky-btn: rgba(255, 255, 255, 0.12);
  --bg-sticky-btn: rgba(255, 255, 255, 0.04);
  --bg-sticky-btn-hover: rgba(255, 255, 255, 0.09);
  color: #94a3b8;
}

:global(.dark) .sticky-toggle-btn:hover {
  color: #f1f5f9;
}

:global(.dark) .sticky-toggle-btn.active {
  background-color: rgba(16, 185, 129, 0.16);
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.4);
}
</style>