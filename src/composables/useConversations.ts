import { ref, computed, type Ref, type ComputedRef } from 'vue';
import type { SearchResult } from './useWebSearch';

// ---------------------------------------------------------------------------
// In-memory multi-conversation store for the AI assistant.
//
// Design notes:
//  * State lives at MODULE scope (declared once, not per <script setup> run),
//    so it survives Vue component unmount/remount. Switching the "ai-chat"
//    page off and on in App.vue destroys and recreates AIChatView, but the
//    conversation roster here is untouched.
//  * It is intentionally NOT persisted to localStorage. Conversations are kept
//    for the lifetime of a single process run (one app launch) and are dropped
//    when the process exits, i.e. a fresh launch starts with a single new,
//    empty(ish) conversation.
// ---------------------------------------------------------------------------

// ---- Shared message/type defs moved here from AIChatView.vue ----
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

// Meta shown in the history list. Kept intentionally light (no messages) so
// the panel doesn't drag the full payload of every conversation.
export interface ConversationMeta {
  id: string;
  label: string;
  timeText: string;
  updatedAt: number;
}

const helpText = `你好，我是 AI 助手 ✨

我可以：
- **自由对话**：在下方输入框提问，与我进行多轮对话。
- **一键生成工作日报**：点击顶部「今日工作日报」，我会结合你今天的任务与 Git 提交记录为你生成日报。

在下方输入框下方的模型选择器中选择并配置模型（右上角 ⚙️ 也可进入模型配置）后可获得最佳体验；未配置 API Key 时会使用内置规则生成简单结果。`;

// Global, monotonic, never-reused counters. Moving id generation here fixes the
// original bug where a component-local idSeq + seed re-ran on every remount.
let convSeq = 0;
let idSeq = 1;

const conversations = ref<Conversation[]>([]);
const activeId = ref<string>('');

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

// Create a brand-new conversation seeded with the welcome bubble and make it
// the active one. Called once at module load and each time the user clicks
// "+ New conversation".
function freshConversation(): void {
  const id = `c${++convSeq}`;
  const conv: Conversation = {
    id,
    label: '新对话',
    messages: [{ id: idSeq++, role: 'assistant', content: helpText }],
    updatedAt: Date.now(),
  };
  conversations.value.push(conv);
  activeId.value = id;
}

// Module init: seed the very first conversation. Because this runs at import
// time (not per component mount), it never re-adds the welcome bubble when the
// AIChatView page is navigated away and back.
freshConversation();

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

  // The active conversation's message array. AIChatView keeps a reference to
  // this computed and mutates the array in place (push / slice / element
  // field writes), which Vue tracks because the nested array is deep-reactive
  // inside the top-level `conversations` ref. Returning the same array object
  // per active conversation means existing streaming/send code is unchanged.
  const messages = computed<LocalMsg[]>(() => activeConversation.value?.messages ?? []);

  const currentLabel = computed<string>(() => activeConversation.value?.label ?? '新对话');

  // If the active conversation still has the placeholder label but now holds a
  // real user turn, derive a readable title from its first user message.
  function refreshLabelIfUntitled(): void {
    const c = activeConversation.value;
    if (!c) return;
    if (c.messages.some((m) => m.role === 'user') && c.label === '新对话') {
      c.label = titleOf(c.messages);
    }
    c.updatedAt = Date.now();
  }

  function touchActiveConversation(): void {
    const c = activeConversation.value;
    if (c) {
      c.updatedAt = Date.now();
    }
  }

  function selectConversation(id: string): void {
    if (!conversations.value.some((c) => c.id === id)) return;
    activeId.value = id;
  }

  function newConversation(): void {
    freshConversation();
  }

  return {
    conversations,
    conversationsMeta,
    activeId,
    messages,
    currentLabel,
    nextMessageId: () => idSeq++,
    selectConversation,
    newConversation,
    refreshLabelIfUntitled,
    touchActiveConversation,
  };
}
