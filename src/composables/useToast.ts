import { ref } from 'vue';

export interface ToastItem {
  id: string;
  message: string;
}

const toasts = ref<ToastItem[]>([]);

export function useToast() {
  const showToast = (message: string, duration = 8000) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2);
    toasts.value.push({ id, message });
    
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  };

  const removeToast = (id: string) => {
    const index = toasts.value.findIndex(t => t.id === id);
    if (index > -1) {
      toasts.value.splice(index, 1);
    }
  };

  return {
    toasts,
    showToast,
    removeToast
  };
}
