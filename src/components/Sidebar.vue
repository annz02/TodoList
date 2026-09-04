<script setup lang="ts">
defineProps<{
  activeCategory: string;
  todayCount: number;
  completedCount: number;
  allCount: number;
  calendarCount?: number;
}>();

const emit = defineEmits<{
  (e: 'update:activeCategory', val: string): void;
  (e: 'add-task-clicked'): void;
  (e: 'open-settings'): void;
}>();
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
          <svg class="menu-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3v3"></path>
            <path d="M16 3v3"></path>
            <rect width="18" height="17" x="3" y="4" rx="2"></rect>
            <path d="M3 10h18"></path>
            <path d="m12 13 .7 1.5 1.6.2-1.2 1.2.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.2 1.6-.2z"></path>
          </svg>
          今天
        </div>
        <span class="badge">{{ todayCount }}</span>
      </div>
      <div class="menu-item" :class="{active: activeCategory === 'completed'}" @click="emit('update:activeCategory', 'completed')">
        <div class="left">
          <svg class="menu-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"></path>
            <path d="m9 12 2 2 4-4"></path>
          </svg>
          已完成
        </div>
        <span class="badge">{{ completedCount }}</span>
      </div>
      <div class="menu-item" :class="{active: activeCategory === 'all'}" @click="emit('update:activeCategory', 'all')">
        <div class="left">
          <svg class="menu-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="8" height="3" x="8" y="3" rx="1"></rect>
            <path d="M16 4.5h2a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2"></path>
            <path d="M12 11h4"></path>
            <path d="M12 16h4"></path>
            <circle cx="8.5" cy="11" r=".5" fill="currentColor"></circle>
            <circle cx="8.5" cy="16" r=".5" fill="currentColor"></circle>
          </svg>
          全部任务
        </div>
        <span class="badge">{{ allCount }}</span>
      </div>
      <div class="menu-item" :class="{active: activeCategory === 'calendar'}" @click="emit('update:activeCategory', 'calendar')">
        <div class="left">
          <svg class="menu-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3v3"></path>
            <path d="M16 3v3"></path>
            <rect width="18" height="17" x="3" y="4" rx="2"></rect>
            <path d="M3 10h18"></path>
            <path d="M8 14h.01"></path>
            <path d="M12 14h.01"></path>
            <path d="M16 14h.01"></path>
            <path d="M8 17.5h.01"></path>
            <path d="M12 17.5h.01"></path>
            <path d="M16 17.5h.01"></path>
          </svg>
          日历视图
        </div>
        <span class="badge">{{ calendarCount ?? allCount }}</span>
      </div>
      <div class="menu-item" :class="{active: activeCategory === 'ai-chat'}" @click="emit('update:activeCategory', 'ai-chat')">
        <div class="left">
          <svg class="menu-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m12 3-2 6-6 2 6 2 2 6 2-6 6-2-6-2-2-6Z"></path>
            <path d="M19 3v4"></path>
            <path d="M17 5h4"></path>
          </svg>
          AI 助手
        </div>
      </div>
    </div>

    <div class="menu" style="margin-top: auto; padding-bottom: 1rem; flex: 0;">
      <div class="menu-item" @click.stop="emit('open-settings')">
        <div class="left">
          <svg class="menu-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          设置
        </div>
      </div>
    </div>
  </aside>
</template>
