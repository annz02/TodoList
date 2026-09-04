import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

const themeMode = ref(localStorage.getItem('themeMode') || 'dark');
const primaryColor = ref(localStorage.getItem('primaryColor') || '#10b981');

export function useTheme() {

  const themeColors = [
    '#10b981', // Emerald (翡翠绿)
    '#ec4899', // Pink (玫瑰粉)
    '#3b82f6', // Blue (经典蓝)
    '#f59e0b', // Amber (琥珀橙)
  ];

  const getIsDark = () => {
    if (themeMode.value === 'dark') return true;
    if (themeMode.value === 'light') return false;
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  };

  const applyTheme = () => {
    if (getIsDark()) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    document.documentElement.style.setProperty('--primary-color', primaryColor.value);
  };

  const saveSettingsToBackend = async () => {
    try {
      const data = JSON.stringify({
        themeMode: themeMode.value,
        primaryColor: primaryColor.value
      });
      await invoke('save_settings', { data });
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  };

  const initTheme = async () => {
    try {
      const data: string = await invoke('load_settings');
      const parsed = JSON.parse(data);
      if (parsed.themeMode) {
        themeMode.value = parsed.themeMode;
        localStorage.setItem('themeMode', parsed.themeMode);
      }
      if (parsed.primaryColor) {
        primaryColor.value = parsed.primaryColor;
        localStorage.setItem('primaryColor', parsed.primaryColor);
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
    applyTheme();
  };

  const setThemeMode = (mode: string) => {
    themeMode.value = mode;
    localStorage.setItem('themeMode', mode);
    applyTheme();
    saveSettingsToBackend();
  };

  const setPrimaryColor = (color: string) => {
    primaryColor.value = color;
    localStorage.setItem('primaryColor', color);
    applyTheme();
    saveSettingsToBackend();
  };

  return {
    themeMode,
    primaryColor,
    themeColors,
    applyTheme,
    initTheme,
    setThemeMode,
    setPrimaryColor
  };
}

// 监听系统深色/浅色模式切换
if (typeof window !== 'undefined' && window.matchMedia) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemThemeChange = () => {
    if (themeMode.value === 'system') {
      const isDark = mediaQuery.matches;
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleSystemThemeChange);
  } else if ((mediaQuery as any).addListener) {
    (mediaQuery as any).addListener(handleSystemThemeChange);
  }
}
