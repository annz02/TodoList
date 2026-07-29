import { invoke } from '@tauri-apps/api/core';

export async function selectFolder(): Promise<string | null> {
  try {
    const selected = await invoke<string | null>('select_folder');
    return selected || null;
  } catch (e) {
    console.error('Failed to select folder via Tauri:', e);
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      (input as any).webkitdirectory = true;
      input.onchange = (event: any) => {
        const files = event.target.files;
        if (files && files.length > 0) {
          const file = files[0];
          const path = file.path || file.webkitRelativePath.split('/')[0];
          resolve(path);
        } else {
          resolve(null);
        }
      };
      input.click();
    });
  }
}
