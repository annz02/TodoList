<script setup lang="ts">
import { useToast, type ToastType } from '../composables/useToast';
const { toasts, removeToast } = useToast();

const getIconClass = (type: ToastType) => {
  return `toast-icon toast-icon-${type}`;
};

const getCardClass = (type: ToastType) => {
  return `toast-card toast-card-${type}`;
};
</script>

<template>
  <div class="toast-container">
    <TransitionGroup name="toast-anim">
      <div v-for="t in toasts" :key="t.id" :class="getCardClass(t.type)">
        <div :class="getIconClass(t.type)">
          <!-- Success Icon -->
          <svg v-if="t.type === 'success'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <!-- Warning Icon -->
          <svg v-else-if="t.type === 'warning'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <!-- Error Icon -->
          <svg v-else-if="t.type === 'error'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          <!-- Info Icon (Default) -->
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        </div>
        <div class="toast-content">
          <div class="toast-title">{{ t.title }}</div>
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
  background-color: var(--bg-main, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  padding: 14px 16px;
  width: 380px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  backdrop-filter: blur(8px);
}

/* Card Type Accents */
.toast-card-info {
  border-left: 4px solid #3b82f6;
}

.toast-card-success {
  border-left: 4px solid #10b981;
}

.toast-card-warning {
  border-left: 4px solid #f59e0b;
}

.toast-card-error {
  border-left: 4px solid #ef4444;
}

.toast-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}

.toast-icon-info {
  color: #3b82f6;
}

.toast-icon-success {
  color: #10b981;
}

.toast-icon-warning {
  color: #f59e0b;
}

.toast-icon-error {
  color: #ef4444;
}

.toast-content {
  flex: 1;
}

.toast-title {
  font-weight: 600;
  font-size: 0.92rem;
  color: var(--text-main, #1f2937);
  margin-bottom: 3px;
}

.toast-message {
  font-size: 0.85rem;
  color: var(--text-secondary, #4b5563);
  line-height: 1.45;
  word-break: break-word;
}

.toast-close {
  cursor: pointer;
  color: var(--text-muted, #9ca3af);
  transition: color 0.2s;
  padding: 2px;
  margin-top: -2px;
  margin-right: -4px;
}

.toast-close:hover {
  color: var(--danger-color, #ef4444);
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
