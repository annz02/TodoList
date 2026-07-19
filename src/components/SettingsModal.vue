<script setup lang="ts">
import { useTheme } from '../composables/useTheme';

defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { themeMode, primaryColor, themeColors, setThemeMode, setPrimaryColor } = useTheme();
</script>

<template>
  <div v-if="show" class="modal-overlay" @click="emit('close')">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2>设置</h2>
        <button class="close-btn" @click="emit('close')">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div class="setting-group">
        <label>外观模式</label>
        <div class="theme-options">
          <button class="theme-btn" :class="{active: themeMode === 'light'}" @click="setThemeMode('light')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
            浅色
          </button>
          <button class="theme-btn" :class="{active: themeMode === 'dark'}" @click="setThemeMode('dark')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
            深色
          </button>
        </div>
      </div>

      <div class="setting-group">
        <label>主题颜色</label>
        <div class="color-options">
          <button 
            v-for="color in themeColors" 
            :key="color"
            class="color-swatch"
            :class="{active: primaryColor === color}"
            :style="{backgroundColor: color}"
            @click="setPrimaryColor(color)"
          ></button>
        </div>
      </div>
    </div>
  </div>
</template>
