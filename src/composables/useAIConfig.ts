import { ref } from 'vue';

// Keys reused from the previous AI summary implementation so existing
// user configuration (if any) keeps working.
const KEY_API_KEY = 'ai_summary_api_key';
const KEY_ENDPOINT = 'ai_summary_endpoint';
const KEY_MODEL = 'ai_summary_model';
const KEY_STREAMING = 'ai_chat_streaming';

const loadBool = (key: string, fallback: boolean): boolean => {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
};

export const DEFAULT_ENDPOINT = 'https://api.deepseek.com/v1';
export const DEFAULT_MODEL = 'deepseek-chat';

const apiKey = ref(localStorage.getItem(KEY_API_KEY) || '');
const endpoint = ref(localStorage.getItem(KEY_ENDPOINT) || DEFAULT_ENDPOINT);
const model = ref(localStorage.getItem(KEY_MODEL) || DEFAULT_MODEL);
const streaming = ref(loadBool(KEY_STREAMING, true));

export interface AIConfig {
  apiKey: string;
  endpoint: string;
  model: string;
  streaming: boolean;
}

const trimEndpoint = (v: string) => v.trim().replace(/\/+$/, '');

export function useAIConfig() {
  const saveSettings = (cfg?: Partial<AIConfig>) => {
    if (cfg) {
      if (typeof cfg.apiKey === 'string') apiKey.value = cfg.apiKey.trim();
      if (typeof cfg.endpoint === 'string') endpoint.value = trimEndpoint(cfg.endpoint);
      if (typeof cfg.model === 'string') model.value = cfg.model.trim();
      if (typeof cfg.streaming === 'boolean') streaming.value = cfg.streaming;
    }
    localStorage.setItem(KEY_API_KEY, apiKey.value);
    localStorage.setItem(KEY_ENDPOINT, endpoint.value);
    localStorage.setItem(KEY_MODEL, model.value);
    localStorage.setItem(KEY_STREAMING, String(streaming.value));
  };

  return {
    apiKey,
    endpoint,
    model,
    streaming,
    saveSettings,
  };
}
