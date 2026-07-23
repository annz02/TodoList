import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

const themeMode = ref(localStorage.getItem('themeMode') || 'light');
const primaryColor = ref(localStorage.getItem('primaryColor') || '#3b82f6');

export function useTheme() {

  const themeColors = [
    '#3b82f6', // Blue
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ec4899', // Pink
  ];

  const applyTheme = () => {
    if (themeMode.value === 'dark') {
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
