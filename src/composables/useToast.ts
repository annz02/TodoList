import { ref } from 'vue';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  type: ToastType;
}

const toasts = ref<ToastItem[]>([]);

export function useToast() {
  const showToast = (
    message: string,
    duration = 5000,
    title = '系统提示',
    type: ToastType = 'info'
  ) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2);
    toasts.value.push({ id, title, message, type });
    
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
