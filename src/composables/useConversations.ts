import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';
import type { SearchResult } from './useWebSearch';

// ---------------------------------------------------------------------------
// Persistent multi-conversation store for the AI assistant.
//
// Conversations and messages are persisted to localStorage so they survive
// closing and reopening the desktop app. Data remains local to this device
// and is cleared if the app data is removed upon uninstallation.
// ---------------------------------------------------------------------------

export interface AgentStep {
  name: string;
  title: string;
  status: 'running' | 'done' | 'error';
}

export interface LocalMsg {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
  steps?: AgentStep[];
}

export interface Conversation {
  id: string;
  label: string;
  messages: LocalMsg[];
  updatedAt: number;
}

export interface ConversationMeta {
  id: string;
  label: string;
  timeText: string;
  updatedAt: number;
}

const KEY_CONVERSATIONS = 'ai_chat_conversations';
const KEY_ACTIVE_ID = 'ai_chat_active_id';

const helpText = `你好，我是 AI 助手 ✨

我可以：
- **自由对话 & 任务管理**：在下方输入框提问，支持日程规划、增删改查任务与联网搜索（需配置大模型）。
- **一键生成工作日报**：点击顶部「今日工作日报」，结合今日任务与 Git 记录生成总结（未配置模型时也可使用本地内置规则生成基础日报）。

请先点击左下角 ⚙️「设置」完成模型配置，配置后即可在输入框下方自由切换模型；未配置 API Key 时无法进行通用问答。`;

let convSeq = 0;
let idSeq = 0;

function formatConvTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();

  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');

  if (isToday) {
    return `${hh}:${mm}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();

  if (isYesterday) {
    return '昨天';
  }

  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

const titleOf = (msgs: LocalMsg[]): string => {
  const firstUser = msgs.find((m) => m.role === 'user');
  const t = (firstUser?.content || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  return t ? `${t}…` : '新对话';
};

function loadStoredConversations(): { list: Conversation[]; activeId: string } | null {
  try {
    const raw = localStorage.getItem(KEY_CONVERSATIONS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    let maxConv = 0;
    let maxId = 0;
    const list: Conversation[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string') continue;
      const m = item.id.match(/^c(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > maxConv) maxConv = n;
      }
      const msgs: LocalMsg[] = Array.isArray(item.messages)
        ? item.messages.filter((msg: any) => {
            if (!msg || typeof msg !== 'object') return false;
            if (typeof msg.id === 'number' && msg.id > maxId) maxId = msg.id;
            return typeof msg.role === 'string' && typeof msg.content === 'string';
          })
        : [];
      list.push({
        id: item.id,
        label: typeof item.label === 'string' && item.label ? item.label : '新对话',
        messages: msgs,
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
      });
    }

    if (list.length === 0) return null;

    convSeq = maxConv;
    idSeq = maxId;

    const savedActiveId = localStorage.getItem(KEY_ACTIVE_ID) || '';
    const active = list.some((c) => c.id === savedActiveId) ? savedActiveId : list[list.length - 1].id;

    return { list, activeId: active };
  } catch (e) {
    console.error('Failed to load stored conversations:', e);
    return null;
  }
}

const stored = loadStoredConversations();
const conversations = ref<Conversation[]>(stored?.list ?? []);
const activeId = ref<string>(stored?.activeId ?? '');

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function flushPersist(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    localStorage.setItem(KEY_CONVERSATIONS, JSON.stringify(conversations.value));
    localStorage.setItem(KEY_ACTIVE_ID, activeId.value);
  } catch (e) {
    console.error('Failed to save conversations:', e);
  }
}

function persist(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushPersist();
  }, 400);
}

function freshConversation(): void {
  const id = `c${++convSeq}`;
  const conv: Conversation = {
    id,
    label: '新对话',
    messages: [{ id: ++idSeq, role: 'assistant', content: helpText }],
    updatedAt: Date.now(),
  };
  conversations.value.push(conv);
  activeId.value = id;
  flushPersist();
}

if (conversations.value.length === 0) {
  freshConversation();
}

watch(conversations, () => persist(), { deep: true });
watch(activeId, (newId) => {
  try {
    localStorage.setItem(KEY_ACTIVE_ID, newId);
  } catch {}
});

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPersist);
}

const activeConversation = computed<Conversation | undefined>(() =>
  conversations.value.find((c) => c.id === activeId.value),
);

export interface ConversationsStore {
  conversations: Ref<Conversation[]>;
  conversationsMeta: ComputedRef<ConversationMeta[]>;
  activeId: Ref<string>;
  messages: ComputedRef<LocalMsg[]>;
  currentLabel: ComputedRef<string>;
  nextMessageId: () => number;
  selectConversation: (id: string) => void;
  newConversation: () => void;
  deleteConversation: (id: string) => void;
  refreshLabelIfUntitled: () => void;
  touchActiveConversation: () => void;
}

export function useConversations(): ConversationsStore {
  const conversationsMeta = computed<ConversationMeta[]>(() =>
    conversations.value.map((c) => ({
      id: c.id,
      label: c.label,
      timeText: formatConvTime(c.updatedAt),
      updatedAt: c.updatedAt,
    })),
  );

  const messages = computed<LocalMsg[]>(() => activeConversation.value?.messages ?? []);
  const currentLabel = computed<string>(() => activeConversation.value?.label ?? '新对话');

  function refreshLabelIfUntitled(): void {
    const c = activeConversation.value;
    if (!c) return;
    if (c.messages.some((m) => m.role === 'user') && c.label === '新对话') {
      c.label = titleOf(c.messages);
    }
    c.updatedAt = Date.now();
    flushPersist();
  }

  function touchActiveConversation(): void {
    const c = activeConversation.value;
    if (c) {
      c.updatedAt = Date.now();
    }
    persist();
  }

  function selectConversation(id: string): void {
    if (!conversations.value.some((c) => c.id === id)) return;
    activeId.value = id;
  }

  function newConversation(): void {
    freshConversation();
  }

  function deleteConversation(id: string): void {
    const idx = conversations.value.findIndex((c) => c.id === id);
    if (idx < 0) return;
    conversations.value.splice(idx, 1);
    if (conversations.value.length === 0) {
      freshConversation();
    } else if (activeId.value === id) {
      const nextIdx = Math.max(0, idx - 1);
      activeId.value = conversations.value[nextIdx].id;
    }
    flushPersist();
  }

  return {
    conversations,
    conversationsMeta,
    activeId,
    messages,
    currentLabel,
    nextMessageId: () => ++idSeq,
    selectConversation,
    newConversation,
    deleteConversation,
    refreshLabelIfUntitled,
    touchActiveConversation,
  };
}
