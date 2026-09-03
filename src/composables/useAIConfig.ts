import { computed, ref, type ComputedRef, type Ref } from 'vue';

// The AI assistant talks to ONE connection (a request address + API key).
// A single endpoint can serve many models, so the config holds a *list* of
// model names under that one connection. `streaming` is a separate global
// toggle that applies regardless of the active model.

export const DEFAULT_ENDPOINT = 'https://api.deepseek.com/v1';
export const DEFAULT_MODEL = 'deepseek-chat';

const KEY_CONNECTION = 'ai_connection'; // JSON { endpoint, apiKey, models, activeModel }
// Reused key so the existing streaming preference survives.
const KEY_STREAMING = 'ai_chat_streaming';
const KEY_WEB_SEARCH = 'ai_chat_web_search';
const KEY_SEARCH_ENGINE = 'ai_chat_search_engine';
const KEY_TAVILY_KEY = 'ai_chat_tavily_key';


const loadBool = (key: string, fallback: boolean): boolean => {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
};

const trimEndpoint = (v: string) => v.trim().replace(/\/+$/, '');
const cleanModel = (v: string) => v.trim();

interface ConnectionState {
  endpoint: string;
  apiKey: string;
  models: string[];
  activeModel: string | null;
}

const seedConnection = (): ConnectionState => ({
  endpoint: DEFAULT_ENDPOINT,
  apiKey: '',
  models: [DEFAULT_MODEL],
  activeModel: DEFAULT_MODEL,
});

const sanitizeConnection = (raw: any): ConnectionState | null => {
  if (!raw || typeof raw !== 'object') return null;
  const endpoint = typeof raw.endpoint === 'string' ? trimEndpoint(raw.endpoint) : '';
  const models: string[] = Array.isArray(raw.models)
    ? raw.models.map(cleanModel).filter((m: string) => m.length > 0)
    : [];
  // Guarantee a non-empty, de-duplicated model list.
  const uniqueModels: string[] = Array.from(new Set(models));
  if (uniqueModels.length === 0) uniqueModels.push(DEFAULT_MODEL);
  let active: string =
    typeof raw.activeModel === 'string' ? cleanModel(raw.activeModel) : '';
  if (!uniqueModels.some((m) => m === active)) active = uniqueModels[0];
  return {
    endpoint: endpoint || DEFAULT_ENDPOINT,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '',
    models: uniqueModels,
    activeModel: active,
  };
};

// Load the single connection; seed a default one if missing/invalid.
let initial: ConnectionState;
try {
  const raw = JSON.parse(localStorage.getItem(KEY_CONNECTION) || 'null');
  initial = sanitizeConnection(raw) ?? seedConnection();
} catch {
  initial = seedConnection();
}

const endpoint = ref<string>(initial.endpoint);
const apiKey = ref<string>(initial.apiKey);
const models = ref<string[]>(initial.models);
const activeModel = ref<string | null>(initial.activeModel);
const streaming = ref(loadBool(KEY_STREAMING, true));
const webSearch = ref(loadBool(KEY_WEB_SEARCH, true));
const searchEngine = ref(localStorage.getItem(KEY_SEARCH_ENGINE) || 'builtin');
const tavilyApiKey = ref(localStorage.getItem(KEY_TAVILY_KEY) || '');

const persist = () => {
  localStorage.setItem(
    KEY_CONNECTION,
    JSON.stringify({
      endpoint: endpoint.value,
      apiKey: apiKey.value,
      models: models.value,
      activeModel: activeModel.value,
    }),
  );
};

// Always resolves because the list is never empty and activeModel is normalized.
const activeModelName = computed<string>(() =>
  models.value.find((m) => m === activeModel.value) ?? models.value[0],
);

// The exact payload used when building a request — stable snapshot source.
const connectionCfg = computed<{ endpoint: string; apiKey: string; model: string }>(() => ({
  endpoint: endpoint.value,
  apiKey: apiKey.value,
  model: activeModelName.value,
}));

export interface AIConfigStore {
  endpoint: Ref<string>;
  apiKey: Ref<string>;
  models: Ref<string[]>;
  activeModel: Ref<string | null>;
  activeModelName: ComputedRef<string>;
  connection: typeof connectionCfg;
  streaming: Ref<boolean>;
  webSearch: Ref<boolean>;
  searchEngine: Ref<string>;
  tavilyApiKey: Ref<string>;
  setConnection: (ep: string, key: string) => void;
  setModels: (names: string[], active: string | null) => void;
  addModel: (name: string) => void;
  removeModel: (name: string) => void;
  setActiveModel: (name: string) => void;
  setStreaming: (v: boolean) => void;
  setWebSearch: (v: boolean) => void;
  setSearchEngine: (v: string) => void;
  setTavilyApiKey: (v: string) => void;
}

export function useAIConfig(): AIConfigStore {
  // Commit the single request-address + API key.
  const setConnection = (ep: string, key: string) => {
    endpoint.value = trimEndpoint(ep) || DEFAULT_ENDPOINT;
    apiKey.value = (key ?? '').trim();
    persist();
  };

  // Bulk-replace the model list (used by the settings form's 保存). Guarantees
  // a non-empty, trimmed, de-duplicated list and repoints the active model if
  // the chosen one isn't present.
  const setModels = (names: string[], active: string | null) => {
    const list = Array.from(new Set((names || []).map(cleanModel).filter((m) => m.length > 0)));
    if (list.length === 0) list.push(DEFAULT_MODEL);
    let act = active ? cleanModel(active) : '';
    if (!list.some((m) => m === act)) act = list[0];
    models.value = list;
    activeModel.value = act;
    persist();
  };

  // Add a model name to the list (trimmed, de-duplicated, non-empty enforced).
  const addModel = (name: string) => {
    const m = cleanModel(name);
    if (!m) return;
    if (models.value.some((x) => x === m)) return;
    models.value = [...models.value, m];
    persist();
  };

  const removeModel = (name: string) => {
    if (models.value.length <= 1) return; // always keep at least one
    models.value = models.value.filter((m) => m !== name);
    if (activeModel.value === name) {
      activeModel.value = models.value[0];
    }
    persist();
  };

  const setActiveModel = (name: string) => {
    if (!models.value.some((m) => m === name)) return;
    activeModel.value = name;
    persist();
  };

  const setStreaming = (v: boolean) => {
    streaming.value = v;
    localStorage.setItem(KEY_STREAMING, String(v));
  };

  const setWebSearch = (v: boolean) => {
    webSearch.value = v;
    localStorage.setItem(KEY_WEB_SEARCH, String(v));
  };

  const setSearchEngine = (v: string) => {
    searchEngine.value = v;
    localStorage.setItem(KEY_SEARCH_ENGINE, v);
  };

  const setTavilyApiKey = (v: string) => {
    tavilyApiKey.value = v.trim();
    localStorage.setItem(KEY_TAVILY_KEY, v.trim());
  };

  return {
    endpoint,
    apiKey,
    models,
    activeModel,
    activeModelName,
    connection: connectionCfg,
    streaming,
    webSearch,
    searchEngine,
    tavilyApiKey,
    setConnection,
    setModels,
    addModel,
    removeModel,
    setActiveModel,
    setStreaming,
    setWebSearch,
    setSearchEngine,
    setTavilyApiKey,
  };
}
