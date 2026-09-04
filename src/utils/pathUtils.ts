import { invoke } from '@tauri-apps/api/core';

export interface ParsedPathInfo {
  raw: string;
  isRemote: boolean;
  projectName: string;
  parentPath: string;
}

/**
 * Check if the given string is a remote Git/Web URL
 */
export function isRemoteUrl(pathStr?: string): boolean {
  if (!pathStr) return false;
  const trimmed = pathStr.trim().toLowerCase();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('git@') ||
    trimmed.startsWith('ssh://')
  );
}

/**
 * Parses and formats a path into a prominent project/repo name and secondary parent path hint.
 */
export function parsePathDisplay(rawPath?: string): ParsedPathInfo {
  if (!rawPath || !rawPath.trim()) {
    return {
      raw: '',
      isRemote: false,
      projectName: '',
      parentPath: '',
    };
  }

  const trimmed = rawPath.trim();

  if (isRemoteUrl(trimmed)) {
    try {
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const url = new URL(trimmed);
        const parts = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '').split('/');
        if (parts.length >= 2) {
          return {
            raw: trimmed,
            isRemote: true,
            projectName: parts[parts.length - 1],
            parentPath: `${url.hostname}/${parts.slice(0, -1).join('/')}`,
          };
        } else if (parts.length === 1 && parts[0]) {
          return {
            raw: trimmed,
            isRemote: true,
            projectName: parts[0],
            parentPath: url.hostname,
          };
        }
      } else if (trimmed.startsWith('git@')) {
        const match = trimmed.match(/git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
        if (match) {
          return {
            raw: trimmed,
            isRemote: true,
            projectName: match[3],
            parentPath: `${match[1]}/${match[2]}`,
          };
        }
      }
    } catch (e) {
      // Fallback
    }

    return {
      raw: trimmed,
      isRemote: true,
      projectName: trimmed,
      parentPath: '',
    };
  }

  // Local filesystem path: normalize slashes
  const normalized = trimmed.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);

  if (segments.length === 0) {
    return {
      raw: trimmed,
      isRemote: false,
      projectName: trimmed,
      parentPath: '',
    };
  }

  const projectName = segments[segments.length - 1];
  let parentPath = '';

  if (segments.length > 1) {
    const parentSegments = segments.slice(0, -1);
    if (parentSegments.length > 2) {
      parentPath = `.../${parentSegments.slice(-2).join('/')}/`;
    } else {
      parentPath = `${parentSegments.join('/')}/`;
    }
  }

  return {
    raw: trimmed,
    isRemote: false,
    projectName,
    parentPath,
  };
}

/**
 * Open path in system file manager (Explorer/Finder)
 */
export async function openInExplorer(pathStr: string): Promise<boolean> {
  try {
    await invoke('open_path_in_explorer', { path: pathStr.trim() });
    return true;
  } catch (err) {
    console.error('Failed to open path in explorer:', err);
    return false;
  }
}

/**
 * Open path in VS Code or code editor
 */
export async function openInEditor(pathStr: string): Promise<boolean> {
  try {
    await invoke('open_path_in_editor', { path: pathStr.trim() });
    return true;
  } catch (err) {
    console.error('Failed to open path in editor:', err);
    return false;
  }
}

/**
 * Open remote URL in default browser
 */
export async function openRemoteLink(urlStr: string): Promise<boolean> {
  try {
    await invoke('open_url', { url: urlStr.trim() });
    return true;
  } catch (err) {
    window.open(urlStr.trim(), '_blank');
    return true;
  }
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    console.warn('Clipboard API error, fallback to execCommand', e);
  }

  try {
    const input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.focus();
    input.select();
    const success = document.execCommand('copy');
    document.body.removeChild(input);
    return success;
  } catch (e) {
    console.error('Failed to copy to clipboard', e);
    return false;
  }
}
