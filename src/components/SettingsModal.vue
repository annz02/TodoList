<script setup lang="ts">
import { useTheme } from '../composables/useTheme';

defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { primaryColor, themeColors, setPrimaryColor } = useTheme();
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
