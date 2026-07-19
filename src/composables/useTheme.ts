import { ref } from 'vue';

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

  const setThemeMode = (mode: string) => {
    themeMode.value = mode;
    localStorage.setItem('themeMode', mode);
    applyTheme();
  };

  const setPrimaryColor = (color: string) => {
    primaryColor.value = color;
    localStorage.setItem('primaryColor', color);
    applyTheme();
  };

  return {
    themeMode,
    primaryColor,
    themeColors,
    applyTheme,
    setThemeMode,
    setPrimaryColor
  };
}
