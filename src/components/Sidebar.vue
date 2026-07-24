<script setup lang="ts">
import { useTheme } from '../composables/useTheme';
defineProps<{
  activeCategory: string;
  todayCount: number;
  completedCount: number;
  allCount: number;
}>();

const emit = defineEmits<{
  (e: 'update:activeCategory', val: string): void;
  (e: 'add-task-clicked'): void;
  (e: 'open-settings'): void;
}>();

const { themeMode, setThemeMode } = useTheme();

</script>

<template>
  <aside class="sidebar">
    <div class="logo-area" data-tauri-drag-region>
      <div style="display: flex; align-items: center; pointer-events: none;">
        <img src="/logo.png" alt="Logo" style="width: 32px; height: 32px; margin-right: 12px; border-radius: 6px; object-fit: contain;" />
        <span style="font-size: 1.25rem;">Todolist</span>
      </div>
      <svg class="plus-btn" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" @click="emit('add-task-clicked')">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </div>

    <div class="menu">
      <div class="menu-item" :class="{active: activeCategory === 'today'}" @click="emit('update:activeCategory', 'today')">
        <div class="left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
          今天
        </div>
        <span class="badge">{{ todayCount }}</span>
      </div>
      <div class="menu-item" :class="{active: activeCategory === 'completed'}" @click="emit('update:activeCategory', 'completed')">
        <div class="left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          已完成
        </div>
        <span class="badge">{{ completedCount }}</span>
      </div>
      <div class="menu-item" :class="{active: activeCategory === 'all'}" @click="emit('update:activeCategory', 'all')">
        <div class="left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
          全部任务
        </div>
        <span class="badge">{{ allCount }}</span>
      </div>
    </div>

    <div class="menu" style="margin-top: auto; padding-bottom: 1rem; flex: 0;">
      <div class="menu-item" @click="emit('open-settings')">
        <div class="left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          设置
        </div>
      </div>
      
      <div class="menu-item" @click="setThemeMode(themeMode === 'dark' ? 'light' : 'dark')">
        <div class="left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
          深色模式
        </div>
        <div class="toggle-switch" :class="{ active: themeMode === 'dark' }">
          <div class="toggle-knob"></div>
        </div>
      </div>
    </div>
  </aside>
</template>
