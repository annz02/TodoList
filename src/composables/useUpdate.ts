import { ref, onMounted } from 'vue';
import { getVersion } from '@tauri-apps/api/app';

export interface UpdateInfo {
  version: string;
  releaseDate: string;
  notes: string;
  url: string;
  downloadUrl?: string;
}

const STORAGE_KEY_AUTO_CHECK = 'auto_check_update';
const REPO_OWNER = 'annz02';
const REPO_NAME = 'TodoList-Ann';

// Helper to compare semver versions (e.g. "0.1.19" vs "0.1.18")
export function compareVersions(v1: string, v2: string): number {
  const clean1 = v1.replace(/^v/i, '').trim();
  const clean2 = v2.replace(/^v/i, '').trim();
  
  const parts1 = clean1.split('.').map(n => parseInt(n, 10) || 0);
  const parts2 = clean2.split('.').map(n => parseInt(n, 10) || 0);
  
  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const val1 = parts1[i] || 0;
    const val2 = parts2[i] || 0;
    if (val1 > val2) return 1;
    if (val1 < val2) return -1;
  }
  return 0;
}

export function useUpdate() {
  const currentVersion = ref<string>('0.1.23');
  const isChecking = ref<boolean>(false);
  const updateAvailable = ref<boolean>(false);
  const pendingUpdate = ref<UpdateInfo | null>(null);
  const checkStatusMsg = ref<string>('');
  const autoCheckUpdate = ref<boolean>(true);

  // Load auto check preference
  onMounted(async () => {
    try {
      currentVersion.value = await getVersion();
    } catch {
      currentVersion.value = '0.1.18';
    }

    const savedAutoCheck = localStorage.getItem(STORAGE_KEY_AUTO_CHECK);
    if (savedAutoCheck !== null) {
      autoCheckUpdate.value = savedAutoCheck === 'true';
    }
  });

  const setAutoCheckUpdate = (val: boolean) => {
    autoCheckUpdate.value = val;
    localStorage.setItem(STORAGE_KEY_AUTO_CHECK, String(val));
  };

  /**
   * Fetch and parse release info from GitHub API or raw CHANGELOG.md
   */
  const checkUpdate = async (isManual = false): Promise<UpdateInfo | null> => {
    isChecking.value = true;
    checkStatusMsg.value = '';
    
    try {
      // 1. Try fetching GitHub latest release
      const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
      const response = await fetch(apiUrl, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });

      if (response.ok) {
        const data = await response.json();
        const latestTag = (data.tag_name || '').trim();
        const latestVer = latestTag.replace(/^v/i, '');

        if (latestVer && compareVersions(latestVer, currentVersion.value) > 0) {
          // Find matching installer asset if present
          let assetUrl = data.html_url;
          if (Array.isArray(data.assets) && data.assets.length > 0) {
            const winAsset = data.assets.find((a: any) => 
              a.name && (a.name.endsWith('.exe') || a.name.endsWith('.msi') || a.name.endsWith('.zip'))
            );
            if (winAsset) assetUrl = winAsset.browser_download_url;
          }

          const updateInfo: UpdateInfo = {
            version: latestVer,
            releaseDate: data.published_at ? new Date(data.published_at).toLocaleDateString('zh-CN') : '',
            notes: data.body || '包含最新的功能优化与问题修复。',
            url: data.html_url || `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`,
            downloadUrl: assetUrl
          };

          pendingUpdate.value = updateInfo;
          updateAvailable.value = true;
          checkStatusMsg.value = `发现新版本 v${latestVer}`;
          return updateInfo;
        }
      }

      // 2. Fallback: Fetch raw CHANGELOG.md
      const changelogUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/CHANGELOG.md`;
      const changelogRes = await fetch(changelogUrl);

      if (changelogRes.ok) {
        const text = await changelogRes.text();
        // Parse version header e.g. ## [0.1.19] - 2026-07-30
        const versionMatch = text.match(/##\s*\[v?([0-9]+\.[0-9]+\.[0-9]+)\](?:\s*-\s*([^\r\n]+))?/);
        if (versionMatch) {
          const latestVer = versionMatch[1];
          const releaseDate = versionMatch[2] ? versionMatch[2].trim() : '';

          if (compareVersions(latestVer, currentVersion.value) > 0) {
            // Extract notes block for this version
            const notesBlockMatch = text.match(/##\s*\[v?[0-9]+\.[0-9]+\.[0-9]+\][^\r\n]*\r?\n([\s\S]*?)(?=\r?\n##\s*\[|\s*$)/);
            const notes = notesBlockMatch ? notesBlockMatch[1].trim() : '包含最新的功能优化与问题修复。';

            const updateInfo: UpdateInfo = {
              version: latestVer,
              releaseDate,
              notes,
              url: `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`
            };

            pendingUpdate.value = updateInfo;
            updateAvailable.value = true;
            checkStatusMsg.value = `发现新版本 v${latestVer}`;
            return updateInfo;
          }
        }
      }

      updateAvailable.value = false;
      pendingUpdate.value = null;
      if (isManual) {
        checkStatusMsg.value = `当前已是最新版本 (v${currentVersion.value})`;
      }
      return null;
    } catch (e: any) {
      if (isManual) {
        checkStatusMsg.value = '检查更新失败，请检查网络连接';
      }
      console.warn('Check update error:', e);
      return null;
    } finally {
      isChecking.value = false;
    }
  };

  return {
    currentVersion,
    isChecking,
    updateAvailable,
    pendingUpdate,
    checkStatusMsg,
    autoCheckUpdate,
    setAutoCheckUpdate,
    checkUpdate,
  };
}
