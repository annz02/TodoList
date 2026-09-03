import { invoke } from '@tauri-apps/api/core';

export interface SearchResult {
  title: string;
  snippet: string;
  link: string;
  source: string;
}

export interface SearchOptions {
  engine?: string;
  api_key?: string;
}

export function useWebSearch() {
  async function search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    try {
      const results = await invoke<SearchResult[]>('web_search', {
        query: trimmed,
        options: options || null,
      });
      return results || [];
    } catch (err: any) {
      console.warn('Web search call failed:', err);
      return [];
    }
  }

  return { search };
}
