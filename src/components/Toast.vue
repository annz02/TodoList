<script setup lang="ts">
import { useToast } from '../composables/useToast';
const { toasts, removeToast } = useToast();
</script>

<template>
  <div class="toast-container">
    <TransitionGroup name="toast-anim">
      <div v-for="t in toasts" :key="t.id" class="toast-card">
        <div class="toast-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
        </div>
        <div class="toast-content">
          <div class="toast-title">任务临期提醒</div>
          <div class="toast-message">{{ t.message }}</div>
        </div>
        <div class="toast-close" @click="removeToast(t.id)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: none;
}

.toast-card {
  pointer-events: auto;
  background-color: var(--bg-main);
  border: 1px solid var(--primary-color);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  padding: 16px;
  width: 400px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  backdrop-filter: blur(8px);
}

.toast-icon {
  color: var(--primary-color);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}

.toast-content {
  flex: 1;
}

.toast-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-main);
  margin-bottom: 4px;
}

.toast-message {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

.toast-close {
  cursor: pointer;
  color: var(--text-muted);
  transition: color 0.2s;
  padding: 2px;
  margin-top: -2px;
  margin-right: -4px;
}

.toast-close:hover {
  color: var(--danger-color);
}

/* Animations */
.toast-anim-enter-active,
.toast-anim-leave-active {
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.toast-anim-enter-from {
  opacity: 0;
  transform: translateX(100%) scale(0.9);
}

.toast-anim-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
