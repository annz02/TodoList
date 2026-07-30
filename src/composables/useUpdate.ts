import { ref, computed, onMounted } from 'vue';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';

// ── Types ──────────────────────────────────────────────────────────────

// Raw status from Rust backend (matches update.rs UpdateStatus camelCase JSON)
export interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up_to_date' | 'error';
  currentVersion: string;
  latestVersion: string | null;
  body: string | null;
  publishedAt: string | null;
  downloadedBytes: number | null;
  contentLength: number | null;
  error: string | null;
}

// Backward-compatible simplified info for existing UI (UpdateModal.vue)
export interface UpdateInfo {
  version: string;
  releaseDate: string;
  notes: string;
  url: string;
}

// ── Constants ──────────────────────────────────────────────────────────

const STORAGE_KEY_AUTO_CHECK = 'auto_check_update';
const REPO_OWNER = 'annz02';
const REPO_NAME = 'TodoList-Ann';

const IDLE_STATE: UpdateStatus = {
  status: 'idle',
  currentVersion: '',
  latestVersion: null,
  body: null,
  publishedAt: null,
  downloadedBytes: null,
  contentLength: null,
  error: null,
};

// ── Helpers ────────────────────────────────────────────────────────────

function mapToUpdateInfo(state: UpdateStatus): UpdateInfo | null {
  if (!state.latestVersion) return null;
  return {
    version: state.latestVersion,
    releaseDate: state.publishedAt
      ? new Date(state.publishedAt).toLocaleDateString('zh-CN')
      : '',
    notes: state.body || '包含最新的功能优化与问题修复。',
    url: `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/v${state.latestVersion}`,
  };
}

// ── Composable ─────────────────────────────────────────────────────────

export function useUpdate() {
  const currentVersion = ref<string>('0.1.25');
  const updateState = ref<UpdateStatus>({ ...IDLE_STATE });
  const autoCheckUpdate = ref<boolean>(true);

  // Derived state
  const isChecking = computed(() => updateState.value.status === 'checking');
  const updateAvailable = computed(() => updateState.value.status === 'available');
  const isDownloading = computed(() => updateState.value.status === 'downloading');
  const isDownloaded = computed(() => updateState.value.status === 'downloaded');
  const updateBusy = computed(() =>
    ['checking', 'downloading'].includes(updateState.value.status),
  );
  const canInstallUpdate = computed(() => updateState.value.status === 'available');
  const progressPercent = computed(() => {
    const downloaded = updateState.value.downloadedBytes ?? 0;
    const total = updateState.value.contentLength ?? 0;
    if (!downloaded || !total) return null;
    return Math.max(0, Math.min(100, Math.round((downloaded / total) * 100)));
  });
  const pendingUpdate = computed<UpdateInfo | null>(() => {
    if (!updateAvailable.value) return null;
    return mapToUpdateInfo(updateState.value);
  });
  const checkStatusMsg = computed(() => {
    switch (updateState.value.status) {
      case 'checking':
        return '正在检查更新...';
      case 'available':
        return `发现新版本 v${updateState.value.latestVersion}`;
      case 'downloading':
        if (progressPercent.value != null) {
          return `正在下载 ${progressPercent.value}%`;
        }
        return '正在下载更新...';
      case 'downloaded':
        return '下载完成，准备安装';
      case 'up_to_date':
        return `当前已是最新版本 (v${currentVersion.value})`;
      case 'error':
        return updateState.value.error || '检查更新失败';
      default:
        return '';
    }
  });

  // Init
  onMounted(async () => {
    try {
      currentVersion.value = await getVersion();
    } catch {
      // keep fallback
    }

    const savedAutoCheck = localStorage.getItem(STORAGE_KEY_AUTO_CHECK);
    if (savedAutoCheck !== null) {
      autoCheckUpdate.value = savedAutoCheck === 'true';
    }
  });

  // ── Actions ────────────────────────────────────────────────────────

  const setAutoCheckUpdate = (val: boolean) => {
    autoCheckUpdate.value = val;
    localStorage.setItem(STORAGE_KEY_AUTO_CHECK, String(val));
  };

  /** Called from event listener (App.vue) to apply backend-pushed state */
  const applyUpdateState = (payload: UpdateStatus) => {
    updateState.value = payload;
  };

  /** Fetch current state from backend (used on startup to restore state) */
  const refreshUpdateState = async () => {
    try {
      const state = await invoke<UpdateStatus>('get_update_state');
      updateState.value = state;
    } catch (e) {
      console.warn('Failed to get update state:', e);
    }
  };

  /**
   * Check for updates via Rust backend (tauri-plugin-updater).
   * @param isManual - If true, show error messages to user
   * @returns UpdateInfo if update available, null otherwise
   */
  const checkUpdate = async (isManual = false): Promise<UpdateInfo | null> => {
    try {
      const state = await invoke<UpdateStatus>('check_for_updates');
      updateState.value = state;
      if (state.status === 'available') {
        return mapToUpdateInfo(state);
      }
      return null;
    } catch (e: any) {
      console.warn('Check update error:', e);
      updateState.value = {
        ...updateState.value,
        status: 'error',
        error: isManual ? '检查更新失败，请检查网络连接' : '',
      };
      return null;
    }
  };

  /** Download and install the pending update. Progress comes via events. */
  const installUpdate = async () => {
    try {
      const state = await invoke<UpdateStatus>('install_update');
      updateState.value = state;
    } catch (e: any) {
      console.error('Install update error:', e);
      updateState.value = {
        ...updateState.value,
        status: 'error',
        error: '安装更新失败',
      };
    }
  };

  return {
    currentVersion,
    updateState,
    // Computed flags
    isChecking,
    updateAvailable,
    isDownloading,
    isDownloaded,
    updateBusy,
    canInstallUpdate,
    progressPercent,
    // Backward-compatible
    pendingUpdate,
    checkStatusMsg,
    autoCheckUpdate,
    // Actions
    setAutoCheckUpdate,
    checkUpdate,
    installUpdate,
    applyUpdateState,
    refreshUpdateState,
  };
}
