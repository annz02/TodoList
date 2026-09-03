<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { Todo } from '../types';
import { useAIConfig } from '../composables/useAIConfig';
import { useAIAssistant } from '../composables/useAIAssistant';
import { useChatStream, type ChatMessage } from '../composables/useChatStream';
import { useWebSearch, type SearchResult } from '../composables/useWebSearch';
import { renderMarkdown } from '../utils/markdown';

const props = defineProps<{ todos: Todo[] }>();

const {
  endpoint,
  apiKey,
  models,
  connection,
  streaming,
  webSearch,
  searchEngine,
  tavilyApiKey,
  setConnection,
  setModels,
  setActiveModel,
  setStreaming,
  setWebSearch,
  setSearchEngine,
  setTavilyApiKey,
} = useAIConfig();
const { sendChat } = useChatStream();
const { search } = useWebSearch();
const assistant = useAIAssistant(computed(() => props.todos));

// ---------------------------------------------------------------------------
// Single-connection model manager (settings page + the chat model chip)
// ---------------------------------------------------------------------------
// Drafts for the ONE request address + API key (committed via 保存).
const draftEndpoint = ref(endpoint.value);
const draftApiKey = ref(apiKey.value);
const draftWebSearch = ref(webSearch.value);
const draftSearchEngine = ref(searchEngine.value);
const draftTavilyKey = ref(tavilyApiKey.value);
// Editable model rows under that connection — one input per model name.
let draftSeq = 0;
const draftModels = ref<{ id: number; name: string }[]>([]);
// Whether the in-place model dropdown in the chat footer is open.
const modelPickerOpen = ref(false);

const activeModelName = computed(() => connection.value.model);

const view = ref<'chat' | 'settings'>('chat');
const input = ref('');
const isWaiting = ref(false);
const abortCtrl = ref<AbortController | null>(null);
const isReportRunning = ref(false);

const openSourceMsgIds = ref<number[]>([]);
const toggleSources = (msgId: number) => {
  const idx = openSourceMsgIds.value.indexOf(msgId);
  if (idx >= 0) {
    openSourceMsgIds.value.splice(idx, 1);
  } else {
    openSourceMsgIds.value.push(msgId);
  }
};

const openUrl = async (url: string) => {
  if (!url) return;
  try {
    await invoke('open_url', { url });
  } catch {
    window.open(url, '_blank');
  }
};

const toggleWebSearch = () => {
  setWebSearch(!webSearch.value);
};

interface LocalMsg {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
  isSearching?: boolean;
}
let idSeq = 1;
const messages = ref<LocalMsg[]>([]);
const scroller = ref<HTMLElement | null>(null);
const textareaEl = ref<HTMLTextAreaElement | null>(null);

// Auto-grow the input textarea up to its CSS max-height, then scroll internally.
const autoGrowTextarea = () => {
  const el = textareaEl.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
  el.scrollTop = 0;
};

const helpText = `你好，我是 AI 助手 ✨

我可以：
- **自由对话**：在下方输入框提问，与我进行多轮对话。
- **一键生成工作日报**：点击顶部「今日工作日报」，我会结合你今天的任务与 Git 提交记录为你生成日报。

在下方输入框下方的模型选择器中选择并配置模型（右上角 ⚙️ 也可进入模型配置）后可获得最佳体验；未配置 API Key 时会使用内置规则生成简单结果。`;

if (messages.value.length === 0) {
  messages.value.push({ id: idSeq++, role: 'assistant', content: helpText });
}

const scrollToBottom = async () => {
  await nextTick();
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight });
};

const lastAssistant = (): LocalMsg => messages.value[messages.value.length - 1];

const toApiMessages = (searchContext = ''): ChatMessage[] => {
  const system = apiKey.value.trim()
    ? '你是 Todolist 内置的 AI 助手，可协助用户整理待办、分析任务、总结每日工作日报。当前已具备实时网络检索能力，若上下文中包含实时网络检索信息，请结合检索信息进行准确回答。回答请简洁、准确、使用中文。'
    : '你是 Todolist 内置的 AI 助手。当前未配置大模型 API，仅能根据内置规则生成工作日报。请友好提醒用户在下方模型选择器中选择并配置模型。';

  const history: ChatMessage[] = [];
  const list = messages.value;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (i === list.length - 1 && m.role === 'assistant') {
      continue;
    }
    if (m.role === 'user' && i === list.length - 2 && searchContext) {
      history.push({ role: m.role, content: m.content + searchContext });
    } else {
      history.push({ role: m.role, content: m.content });
    }
  }

  return [
    { role: 'system', content: system },
    ...history,
  ];
};

/**
 * Run a completion against the current tail assistant message.
 * Pushes an empty assistant message if the last is not empty (never happens in
 * our flows except the direct-report branch which pre-pushes one).
 */
async function streamInto(tail: LocalMsg, searchContext = ''): Promise<boolean> {
  const ctrl = new AbortController();
  abortCtrl.value = ctrl;
  isWaiting.value = true;
  const stream = streaming.value;
  // Snapshot the connection so a mid-flight switch can't retarget this request.
  const cfg = connection.value;
  try {
    const full = await sendChat({
      endpoint: cfg.endpoint,
      apiKey: cfg.apiKey,
      model: cfg.model,
      messages: toApiMessages(searchContext),
      stream,
      signal: ctrl.signal,
      onChunk: (chunk) => {
        tail.content += chunk;
        scrollToBottom();
      },
    });
    if (!stream && full) tail.content = full;
    if (stream && !tail.content) tail.content = full || '（模型返回了空回复，请稍后重试）';
    await scrollToBottom();
    return true;
  } catch (err: any) {
    // Distinguish a user-initiated abort from a real failure.
    if (ctrl.signal.aborted) {
      if (!tail.content) tail.content = '⏹️ 已停止生成。';
    } else {
      tail.content += `\n\n> ⚠️ 调用出错：${err?.message || err}\n> 请检查当前模型的请求地址 / API Key / 模型，或网络是否可用。`;
    }
    await scrollToBottom();
    return false;
  } finally {
    abortCtrl.value = null;
    isWaiting.value = false;
  }
}

// ---------- Send / stop ----------
const sendMessage = async () => {
  const text = input.value.trim();
  if (!text || isWaiting.value) return;
  if (abortCtrl.value) return;

  input.value = '';
  autoGrowTextarea();
  messages.value.push({ id: idSeq++, role: 'user', content: text });
  const tail: LocalMsg = { id: idSeq++, role: 'assistant', content: '', sources: [], isSearching: false };
  messages.value.push(tail);
  await scrollToBottom();

  if (!apiKey.value.trim()) {
    tail.content = '（尚未配置 API Key，请在输入框下方或 ⚙️ 模型配置中填写后即可与我对话；通用问答需要模型支持。）';
    await scrollToBottom();
    return;
  }

  let searchContext = '';
  if (webSearch.value) {
    tail.isSearching = true;
    isWaiting.value = true;
    try {
      const results = await search(text, {
        engine: searchEngine.value,
        api_key: tavilyApiKey.value,
      });
      if (results && results.length > 0) {
        tail.sources = results;
        const now = new Date();
        const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
        const snippets = results
          .map((r, i) => `[${i + 1}] 来源: ${r.source}\n标题: ${r.title}\n链接: ${r.link}\n内容: ${r.snippet}`)
          .join('\n\n');
        searchContext = `\n\n---\n【网络实时检索结果（当前日期：${dateStr}）】：\n${snippets}\n\n【回答要求】：请结合上述最新的网络实时检索信息，准确、清晰且有条理地回答用户的问题。在适当时可以自然标注信息来源。`;
      }
    } catch (e) {
      console.warn('Web search failed:', e);
    } finally {
      tail.isSearching = false;
    }
  }

  await streamInto(tail, searchContext);
};

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};

const stopGenerating = () => {
  abortCtrl.value?.abort();
};

// ---------- Daily report ----------
const generateDailyReport = async () => {
  if (isReportRunning.value || isWaiting.value) return;
  isReportRunning.value = true;
  try {
    await assistant.fetchGitCommits();
    await scrollToBottom();

    if (apiKey.value.trim()) {
      // Ask the model using the structured data.
      messages.value.push({ id: idSeq++, role: 'user', content: assistant.buildDataPrompt() });
      const tail = { id: idSeq++, role: 'assistant' as const, content: '' };
      messages.value.push(tail);
      await scrollToBottom();
      const ok = await streamInto(tail);
      if (!ok) {
        // Fall back to built-in so the user still gets something.
        tail.content = `\n\n> 在线生成失败，下面是内置规则生成的日报：\n\n` + assistant.builtInSummary();
        await scrollToBottom();
      }
      return;
    }

    // No key => offline built-in summary.
    const summary = assistant.builtInSummary();
    messages.value.push({ id: idSeq++, role: 'user', content: '请为我生成今天的 AI 工作日报' });
    messages.value.push({ id: idSeq++, role: 'assistant', content: `📋 已根据内置规则为您生成今日工作日报：\n\n${summary}` });
    await scrollToBottom();
  } catch (err: any) {
    console.error('生成日报失败：', err);
  } finally {
    isReportRunning.value = false;
  }
};

// ---------- Per-message copy ----------
// Id of the message whose copy check-mark is currently shown.
const copiedMsgId = ref<number | null>(null);

const copyMessage = async (msg: LocalMsg) => {
  if (isWaiting.value && msg.id === currentTypingMsg.value) return;
  const text = msg.content.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copiedMsgId.value = msg.id;
    setTimeout(() => {
      if (copiedMsgId.value === msg.id) copiedMsgId.value = null;
    }, 1800);
  } catch (e) {
    console.error('copy failed', e);
  }
};

// ---------- Model manager settings ----------
const openSettings = () => {
  // Make the drafts reflect the current saved config.
  draftEndpoint.value = endpoint.value;
  draftApiKey.value = apiKey.value;
  draftWebSearch.value = webSearch.value;
  draftSearchEngine.value = searchEngine.value;
  draftTavilyKey.value = tavilyApiKey.value;
  draftModels.value = models.value.map((m) => ({ id: ++draftSeq, name: m }));
  modelPickerOpen.value = false;
  view.value = 'settings';
};

const backToChat = () => {
  view.value = 'chat';
};

// Add an empty model row to the draft list.
const addModelRow = () => {
  draftModels.value = [...draftModels.value, { id: ++draftSeq, name: '' }];
};

// Remove a draft model row by its row id (always keeps at least one row).
const removeModelRow = (id: number) => {
  draftModels.value = draftModels.value.filter((r) => r.id !== id);
  if (draftModels.value.length === 0) addModelRow();
};

// Commit the whole single connection: request address + key + model rows + web search.
const handleSaveConfig = () => {
  setConnection(draftEndpoint.value, draftApiKey.value);
  setWebSearch(draftWebSearch.value);
  setSearchEngine(draftSearchEngine.value);
  setTavilyApiKey(draftTavilyKey.value);
  const names = draftModels.value
    .map((r) => r.name)
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
  // Keep the currently active model if it's still configured; otherwise setModels
  // falls back to the first model. The model switch happens in the chat footer.
  setModels(names, activeModelName.value || null);
  backToChat();
};

const toggleStreaming = () => setStreaming(!streaming.value);

// Can only save when an address is present and at least one model name is filled.
const canSaveConfig = computed(() => {
  if (!draftEndpoint.value.trim()) return false;
  return draftModels.value.some((r) => r.name.trim().length > 0);
});

// Pick a model from the chat footer chip dropdown (immediate, live).
const pickModel = (name: string) => {
  setActiveModel(name);
  modelPickerOpen.value = false;
};

// Which assistant message is waiting for its first token (drives the typing dots).
const currentTypingMsg = computed(() =>
  isWaiting.value ? (lastAssistant()?.id ?? 0) : 0,
);
</script>

<template>
  <div class="ai-chat">
    <!-- ============ Chat view ============ -->
    <template v-if="view === 'chat'">
      <!-- Toolbar -->
      <div class="chat-toolbar">
        <button
          class="tool-btn report-btn"
          :disabled="isReportRunning || isWaiting"
          @click="generateDailyReport"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
          {{ isReportRunning ? '生成中…' : '今日工作日报' }}
        </button>

        <div class="toolbar-actions">
          <button class="tool-btn icon" title="模型配置" @click="openSettings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          </button>
        </div>
      </div>

      <!-- Conversation -->
      <div ref="scroller" class="chat-scroll">
        <div class="chat-messages">
          <div v-for="msg in messages" :key="msg.id" class="msg-row" :class="msg.role">
            <div class="avatar" :class="msg.role">
              <svg v-if="msg.role === 'assistant'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="16" height="11" rx="3"></rect><line x1="9" y1="9" x2="9" y2="5.5"></line><line x1="15" y1="9" x2="15" y2="5.5"></line><circle cx="9" cy="4" r="1.2" fill="currentColor" stroke="none"></circle><circle cx="15" cy="4" r="1.2" fill="currentColor" stroke="none"></circle><circle cx="9" cy="14.5" r="1.3" fill="currentColor" stroke="none"></circle><circle cx="15" cy="14.5" r="1.3" fill="currentColor" stroke="none"></circle></svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </div>
            <div class="bubble" :class="msg.role">
              <template v-if="msg.role === 'assistant'">
                <!-- Searching state -->
                <div v-if="msg.isSearching" class="search-indicator">
                  <span class="search-spinner"></span>
                  <span class="search-text">正在网络检索实时信息…</span>
                </div>

                <div class="md-content" v-html="renderMarkdown(msg.content)"></div>

                <!-- Web sources citations -->
                <div v-if="msg.sources && msg.sources.length > 0" class="sources-wrap">
                  <button
                    type="button"
                    class="sources-toggle-btn"
                    :class="{ open: openSourceMsgIds.includes(msg.id) }"
                    @click="toggleSources(msg.id)"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                    <span>参考来源 ({{ msg.sources.length }})</span>
                    <svg class="sources-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </button>
                  <div v-if="openSourceMsgIds.includes(msg.id)" class="sources-panel">
                    <a
                      v-for="(src, idx) in msg.sources"
                      :key="idx"
                      class="source-card"
                      :href="src.link"
                      :title="src.link"
                      @click.prevent="openUrl(src.link)"
                    >
                      <div class="source-card-header">
                        <span class="source-card-num">{{ idx + 1 }}</span>
                        <span class="source-card-title">{{ src.title }}</span>
                        <span class="source-card-tag">{{ src.source }}</span>
                      </div>
                      <div v-if="src.snippet" class="source-card-snippet">{{ src.snippet }}</div>
                    </a>
                  </div>
                </div>

                <span
                  v-if="isWaiting && msg.id === currentTypingMsg && msg.content === '' && !msg.isSearching"
                  class="typing"
                >
                  <i></i><i></i><i></i>
                </span>
                <button
                  class="copy-msg-btn"
                  :class="{ copied: copiedMsgId === msg.id }"
                  :title="copiedMsgId === msg.id ? '已复制' : '复制'"
                  :disabled="msg.id === currentTypingMsg && msg.content === ''"
                  @click="copyMessage(msg)"
                >
                  <svg v-if="copiedMsgId !== msg.id" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </button>
              </template>
              <pre v-else class="user-content">{{ msg.content }}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- Input -->
      <div class="chat-footer">
        <div class="chat-box">
          <textarea
            ref="textareaEl"
            v-model="input"
            rows="1"
            class="input-area"
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            @keydown="onKeydown"
            @input="autoGrowTextarea"
          ></textarea>

          <!-- Bottom control row: model selector & web search (left) / arrow send (right) -->
          <div class="chat-controls">
            <div class="control-left-group">
              <div class="model-select-wrap">
                <button
                  type="button"
                  class="model-chip"
                  :title="activeModelName"
                  @click="modelPickerOpen = !modelPickerOpen"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17" x2="14" y2="17"></line></svg>
                  <span class="model-chip-label">{{ activeModelName }}</span>
                  <svg class="model-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>

                <div v-if="modelPickerOpen" class="model-dropdown">
                  <div
                    v-for="m in models"
                    :key="m"
                    class="model-option"
                    :class="{ active: m === activeModelName }"
                    :title="m"
                    @click="pickModel(m)"
                  >
                    <div class="model-option-head">
                      <span class="model-option-name">{{ m }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Web Search toggle chip -->
              <button
                type="button"
                class="web-search-chip"
                :class="{ active: webSearch }"
                :title="webSearch ? '联网检索已开启（点击可关闭）' : '联网检索已关闭（点击开启）'"
                @click="toggleWebSearch"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                <span>联网搜索</span>
              </button>
            </div>

            <!-- Circular arrow send / stop -->
            <button
              v-if="isWaiting"
              type="button"
              class="send-circle stop"
              title="停止生成"
              @click="stopGenerating"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>
            </button>
            <button
              v-else
              type="button"
              class="send-circle"
              :disabled="!input.trim()"
              title="发送"
              @click="sendMessage"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="20" y2="12"></line><polyline points="13 5 20 12 13 19"></polyline></svg>
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- ============ Settings page ============ -->
    <div v-else class="settings-page">
      <div class="settings-scroll">
        <div class="settings-shell">
          <!-- Page heading -->
          <div class="brand-head">
            <button
              class="brand-icon back"
              type="button"
              @click="backToChat"
              aria-label="返回对话"
              title="返回对话"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            </button>
            <div>
              <h2 class="brand-title">模型配置</h2>
              <p class="brand-sub">配置调用的大模型服务，用于 AI 助手对话与日报生成。</p>
            </div>
          </div>

          <!-- Single form: spread over the whole page width (no narrow card) -->
          <form class="ai-config" @submit.prevent="handleSaveConfig">
            <div class="ai-config-conn">
              <div class="field">
                <label class="field-label" for="ai-endpoint">请求地址</label>
                <input
                  id="ai-endpoint"
                  class="field-input mono"
                  type="text"
                  spellcheck="false"
                  v-model="draftEndpoint"
                  placeholder="https://api.deepseek.com/v1"
                />
                <div class="field-hint">兼容 OpenAI 格式，通常以 /v1 结尾（DeepSeek、OpenAI、Ollama 等）。</div>
              </div>

              <div class="field">
                <label class="field-label" for="ai-key">API Key</label>
                <input
                  id="ai-key"
                  class="field-input mono"
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  v-model="draftApiKey"
                  placeholder="sk-…"
                />
                <div class="field-hint" :class="{ tip: draftApiKey }">
                  {{ draftApiKey ? '密钥仅保存在本机，不会上传。' : '未填写时将仅使用内置规则生成简单结果。' }}
                </div>
              </div>
            </div>

            <!-- 模型：多个输入行，每行一个模型名称，横排铺开 -->
            <div class="ai-config-section">
              <div class="section-title">模型</div>
              <div class="model-editor">
                <div
                  v-for="row in draftModels"
                  :key="row.id"
                  class="model-editor-row"
                >
                  <input
                    class="field-input mono model-row-input"
                    type="text"
                    spellcheck="false"
                    v-model="row.name"
                    placeholder="deepseek-chat"
                  />
                  <button
                    type="button"
                    class="model-row-del"
                    :disabled="draftModels.length <= 1"
                    title="移除该模型"
                    @click.prevent="removeModelRow(row.id)"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              </div>
              <button type="button" class="btn-add-model" @click.prevent="addModelRow">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                添加模型
              </button>
            </div>

            <div class="ai-config-section">
              <div class="toggle-row">
                <div class="toggle-text">
                  <span class="toggle-title">流式输出</span>
                  <span class="toggle-desc">逐字显示回复，体验更流畅；关闭则等待完整结果后一次性展示。</span>
                </div>
                <button
                  type="button"
                  class="switch"
                  :class="{ on: streaming }"
                  :aria-pressed="streaming"
                  @click="toggleStreaming"
                >
                  <span class="switch-knob"></span>
                </button>
              </div>
            </div>

            <!-- 实时网络检索（Search）配置 -->
            <div class="ai-config-section">
              <div class="toggle-row">
                <div class="toggle-text">
                  <span class="toggle-title">实时网络检索（Search）</span>
                  <span class="toggle-desc">开启后，询问时效性问题（如天气、新闻、最新资讯）时自动调用实时检索并结合结果回答。</span>
                </div>
                <button
                  type="button"
                  class="switch"
                  :class="{ on: draftWebSearch }"
                  :aria-pressed="draftWebSearch"
                  @click="draftWebSearch = !draftWebSearch"
                >
                  <span class="switch-knob"></span>
                </button>
              </div>

              <div v-if="draftWebSearch" class="search-options-box">
                <div class="field-label search-engine-label">搜索引擎源</div>
                <div class="engine-radios">
                  <label class="engine-radio-item" :class="{ active: draftSearchEngine === 'builtin' }">
                    <input type="radio" value="builtin" v-model="draftSearchEngine" />
                    <div class="engine-radio-text">
                      <span class="engine-name">内置免费检索（推荐）</span>
                      <span class="engine-sub">包含 Bing 搜索与实时气象中心，无需配置任何 API Key</span>
                    </div>
                  </label>
                  <label class="engine-radio-item" :class="{ active: draftSearchEngine === 'tavily' }">
                    <input type="radio" value="tavily" v-model="draftSearchEngine" />
                    <div class="engine-radio-text">
                      <span class="engine-name">Tavily Search API</span>
                      <span class="engine-sub">专为 AI 优化的高质量专业搜索服务（需填 Key）</span>
                    </div>
                  </label>
                </div>

                <div v-if="draftSearchEngine === 'tavily'" class="tavily-key-field">
                  <label class="field-label" for="tavily-key">Tavily API Key</label>
                  <input
                    id="tavily-key"
                    class="field-input mono"
                    type="password"
                    v-model="draftTavilyKey"
                    placeholder="tvly-…"
                  />
                  <div class="field-hint">未填写或额度耗尽时将自动回退到内置免费检索。</div>
                </div>
              </div>
            </div>

            <div class="ai-config-actions">
              <button type="button" class="btn-secondary" @click="backToChat">返回</button>
              <button
                type="submit"
                class="btn-primary"
                :disabled="!canSaveConfig"
              >保存配置</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  user-select: text;
}

/* Toolbar */
.chat-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
}
.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12.5px;
  cursor: pointer;
  transition: all .18s ease;
}
.report-btn {
  background: var(--primary-light);
  border-color: transparent;
  color: var(--primary-color);
  font-weight: 600;
}
.report-btn:hover:not(:disabled) { color: var(--primary-color); border-color: var(--primary-color); }
.tool-btn:hover:not(:disabled) { color: var(--primary-color); border-color: var(--primary-color); }
.tool-btn:disabled { opacity: .6; cursor: not-allowed; }
.tool-btn.icon { padding: 6px; }
.toolbar-actions { display: flex; gap: 6px; }
.tool-btn:disabled { cursor: not-allowed; opacity: .6; }

/* Settings page: single full-width content column */
.settings-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.settings-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 4px 28px;
}
.settings-shell { width: 100%; padding-bottom: 4px; }

/* Heading with icon (back button) + title + subtitle */
.brand-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 4px 4px 18px;
}
.brand-icon.back {
  flex-shrink: 0;
  width: 38px; height: 38px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 10px;
  padding: 0;
  background: var(--primary-light);
  color: var(--primary-color);
  border: 1px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
  cursor: pointer;
  transition: all .18s ease;
}
.brand-icon.back svg { transition: transform .18s ease; }
.brand-icon.back:hover { background: var(--primary-color); color: #fff; box-shadow: 0 4px 12px color-mix(in srgb, var(--primary-color) 30%, transparent); }
.brand-icon.back:hover svg { transform: translateX(-2px); }
.brand-title { margin: 0; font-size: 19px; font-weight: 700; color: var(--text-main); line-height: 1.3; }
.brand-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--text-muted); line-height: 1.55; }

/* Settings form: full width, spread across the page (no card) */
.ai-config {
  display: flex;
  flex-direction: column;
  width: 100%;
}
.ai-config-conn {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.ai-config-section {
  margin-top: 22px;
}
.section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 12px;
}
.ai-config-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 28px;
  padding-top: 18px;
  border-top: 1px solid var(--border-color);
}

/* Field stack */
.field { display: flex; flex-direction: column; }
.field-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 6px;
}
.field-input {
  width: 100%;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 9px;
  padding: 9px 12px;
  font-size: 13px;
  color: var(--text-main);
  outline: none;
  transition: border-color .18s ease, box-shadow .18s ease;
}
.field-input.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; }
.field-input::placeholder { color: var(--text-muted); }
.field-input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 16%, transparent);
}
.field-hint {
  font-size: 11.5px;
  color: var(--text-secondary);
  margin-top: 6px;
  line-height: 1.5;
}
.field-hint:empty { display: none; }
.field-hint.tip { color: var(--text-muted); }

/* Toggle row */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.toggle-text { display: flex; flex-direction: column; gap: 3px; }
.toggle-title { font-size: 15px; font-weight: 700; color: var(--text-main); }
.toggle-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
.switch {
  flex-shrink: 0;
  width: 44px; height: 24px;
  background: var(--border-color);
  border: none;
  border-radius: 13px;
  position: relative;
  cursor: pointer;
  transition: background-color .2s ease;
  padding: 0;
}
.switch.on { background: var(--primary-color); }
.switch-knob {
  position: absolute;
  top: 3px; left: 3px;
  width: 18px; height: 18px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,.22);
  transition: transform .2s ease;
}
.switch.on .switch-knob { transform: translateX(20px); }

.btn-secondary {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 9px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all .18s ease;
}
.btn-secondary:hover { color: var(--primary-color); border-color: var(--primary-color); }
.btn-primary {
  background: var(--primary-color);
  color: #fff;
  border: none;
  border-radius: 9px;
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity .18s ease, box-shadow .18s ease;
}
.btn-primary:hover { opacity: .9; box-shadow: 0 4px 12px color-mix(in srgb, var(--primary-color) 32%, transparent); }

/* Scroll + messages */
.chat-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 6px 12px 4px; }
.chat-messages { display: flex; flex-direction: column; gap: 16px; }
.msg-row { display: flex; gap: 10px; align-items: flex-start; }
.msg-row.user { flex-direction: row-reverse; }
.avatar {
  width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.avatar.assistant { background: var(--primary-light); color: var(--primary-color); }
.avatar.user { background: color-mix(in srgb, var(--text-muted) 20%, transparent); color: var(--text-secondary); }
.bubble {
  max-width: 78%; padding: 10px 14px; border-radius: 12px; font-size: 13.5px; line-height: 1.65;
  word-break: break-word;
}
.bubble.assistant { background: var(--bg-sidebar); border: 1px solid var(--border-color); border-top-left-radius: 4px; position: relative; padding-right: 28px; }
.bubble.user { background: var(--primary-color); color: #fff; border-top-right-radius: 4px; }
.user-content { margin: 0; white-space: pre-wrap; font-family: inherit; font-size: 13.5px; color: inherit; }

/* per-message copy button (always visible, top-right) */
.copy-msg-btn {
  position: absolute; top: 6px; right: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0;
  background: color-mix(in srgb, var(--text-muted) 10%, transparent);
  border: none; border-radius: 5px;
  color: var(--text-secondary); cursor: pointer;
  transition: color .15s ease, background-color .15s ease;
}
.copy-msg-btn:hover { color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 14%, transparent); }
.copy-msg-btn.copied { color: var(--success-color, #16a34a); background: transparent; }
.copy-msg-btn:disabled { color: var(--text-muted); cursor: not-allowed; }

/* typing dots */
.typing { display: inline-flex; gap: 4px; align-items: center; padding-top: 2px; }
.typing i { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); animation: blink 1.2s infinite; }
.typing i:nth-child(2) { animation-delay: .2s; }
.typing i:nth-child(3) { animation-delay: .4s; }
@keyframes blink { 0%,80%,100% { opacity: .25; } 40% { opacity: 1; } }

/* markdown body */
.md-content :deep(.chat-p) { margin: 0 0 8px 0; }
.md-content :deep(.chat-p:last-child) { margin-bottom: 0; }
.md-content :deep(.chat-report-title) { font-weight: 600; color: var(--primary-color); margin: 4px 0 8px; }
.md-content :deep(.chat-report-content) { padding-left: 12px; border-left: 2px solid color-mix(in srgb, var(--primary-color) 28%, transparent); }
.md-content :deep(.chat-subline) { color: var(--text-secondary); padding-left: 8px; }
.md-content :deep(.chat-h1), :deep(.chat-h2), :deep(.chat-h3), :deep(.chat-h4) { margin: 10px 0 6px; }
.md-content :deep(.chat-divider) { border: none; border-top: 1px dashed var(--border-color); margin: 12px 0; }
.md-content :deep(.chat-inline-code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: color-mix(in srgb, var(--text-muted) 15%, transparent);
  padding: 1px 5px; border-radius: 4px; font-size: 12px;
}
.md-content :deep(.chat-code) {
  background: color-mix(in srgb, var(--text-main) 6%, var(--bg-main));
  border: 1px solid var(--border-color); border-radius: 8px;
  padding: 10px 12px; overflow: auto; margin: 8px 0;
}
.md-content :deep(.chat-code code) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
.md-content :deep(a) { color: var(--primary-color); }
.md-content :deep(strong) { font-weight: 600; }

/* Input footer: vertical dialogue box (input on top, model/send row below) */
.chat-footer {
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}
.chat-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 8px 8px 6px;
  transition: border-color .18s ease;
}
.chat-box:focus-within { border-color: var(--primary-color); }

/* Model selector (bottom-left) */
.model-select-wrap { position: relative; flex-shrink: 0; align-self: center; }
.model-chip {
  display: inline-flex; align-items: center; gap: 6px;
  max-width: 230px;
  background: transparent; border: 1px solid transparent; border-radius: 9px;
  color: var(--text-secondary); padding: 6px 8px; font-size: 13px; cursor: pointer;
  transition: color .18s ease, background-color .18s ease;
}
.model-chip:hover { color: var(--primary-color); background: var(--bg-main); }
.model-chip-label {
  flex: 1 1 auto; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.model-chip > svg { flex-shrink: 0; }
.model-chevron { flex-shrink: 0; color: var(--text-muted); transition: transform .18s ease; }
.model-chip:hover .model-chevron { transform: translateY(1px); }

/* Top input */
.input-area {
  width: 100%; resize: none; min-height: 34px; max-height: 120px;
  background: transparent; border: none; outline: none;
  padding: 4px 2px; font-size: 13.5px; color: var(--text-main);
  line-height: 1.55;
}

/* Bottom control row */
.chat-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 38px;
  padding-top: 2px;
}

/* Circular arrow send / stop state */
.send-circle {
  flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; padding: 0;
  background: var(--primary-color); color: #fff; border: none; border-radius: 50%;
  cursor: pointer; transition: opacity .18s ease, background-color .18s ease;
}
.send-circle:hover:not(:disabled) { filter: brightness(1.06); }
.send-circle:disabled { opacity: .4; cursor: not-allowed; }
.send-circle.stop { background: var(--danger-color, #ef4444); }
.send-circle.stop:hover { filter: none; }

.model-dropdown {
  position: absolute; left: 0; bottom: calc(100% + 8px); z-index: 30;
  width: max-content; min-width: 140px; max-width: 340px;
  max-height: 280px; overflow-y: auto;
  background: var(--bg-main); border: 1px solid var(--border-color);
  border-radius: 11px; box-shadow: 0 10px 28px rgba(0,0,0,.14);
  padding: 5px; display: flex; flex-direction: column;
}
.model-option {
  display: flex; flex-direction: column; gap: 2px;
  padding: 8px 10px; border-radius: 8px; cursor: pointer;
  color: var(--text-main);
}
.model-option:hover { background: var(--primary-light); }
.model-option.active { background: color-mix(in srgb, var(--primary-color) 12%, transparent); }
.model-option-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.model-option-name {
  font-size: 14px; font-weight: 600;
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 模型 rows — spread across the page width */
.model-editor {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px 18px;
}
.model-editor-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.model-row-input { flex: 1; }
.model-row-del {
  flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; padding: 0;
  color: var(--text-muted); background: transparent; border: none; border-radius: 8px;
  cursor: pointer; transition: color .15s ease, background-color .15s ease;
}
.model-row-del:hover:not(:disabled) {
  color: var(--danger-color, #ef4444);
  background: color-mix(in srgb, var(--danger-color, #ef4444) 12%, transparent);
}
.model-row-del:disabled { opacity: .35; cursor: not-allowed; }
.btn-add-model {
  align-self: flex-start;
  display: inline-flex; align-items: center; gap: 6px;
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--primary-color);
  background: transparent; border: none; padding: 6px 8px; border-radius: 8px;
  cursor: pointer; transition: background-color .15s ease;
}
.btn-add-model:hover { background: var(--primary-light); }

/* Left group in chat-controls (model selector + web search toggle) */
.control-left-group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* Web Search toggle chip */
.web-search-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  color: var(--text-muted);
  padding: 5px 9px;
  font-size: 12px;
  cursor: pointer;
  transition: all .18s ease;
  user-select: none;
}
.web-search-chip:hover {
  color: var(--primary-color);
  border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
  background: color-mix(in srgb, var(--primary-color) 6%, transparent);
}
.web-search-chip.active {
  color: var(--primary-color);
  background: var(--primary-light);
  border-color: color-mix(in srgb, var(--primary-color) 35%, transparent);
  font-weight: 500;
}

/* Search status banner inside assistant message bubble */
.search-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0 8px;
  color: var(--primary-color);
  font-size: 12.5px;
  font-weight: 500;
}
.search-spinner {
  width: 13px;
  height: 13px;
  border: 2px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Citations accordion inside bubble */
.sources-wrap {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-color);
}
.sources-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: color-mix(in srgb, var(--text-muted) 8%, transparent);
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 3px 8px;
  font-size: 11.5px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all .16s ease;
}
.sources-toggle-btn:hover {
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  border-color: color-mix(in srgb, var(--primary-color) 25%, transparent);
}
.sources-chevron {
  transition: transform .18s ease;
}
.sources-toggle-btn.open .sources-chevron {
  transform: rotate(180deg);
}

.sources-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}
.source-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 10px;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: all .15s ease;
}
.source-card:hover {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 4%, var(--bg-main));
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,.06);
}
.source-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
}
.source-card-num {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--primary-color);
  background: var(--primary-light);
  border-radius: 4px;
  padding: 1px 5px;
}
.source-card-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.source-card-tag {
  font-size: 10.5px;
  color: var(--text-muted);
}
.source-card-snippet {
  font-size: 11.5px;
  color: var(--text-secondary);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Settings: search options box */
.search-options-box {
  margin-top: 14px;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--bg-sidebar) 50%, transparent);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.search-engine-label {
  margin-bottom: 2px;
}
.engine-radios {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.engine-radio-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 12px;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all .16s ease;
}
.engine-radio-item input {
  margin-top: 3px;
  accent-color: var(--primary-color);
  cursor: pointer;
}
.engine-radio-item:hover {
  border-color: var(--primary-color);
}
.engine-radio-item.active {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 5%, var(--bg-main));
}
.engine-radio-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.engine-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}
.engine-sub {
  font-size: 11.5px;
  color: var(--text-muted);
}
.tavily-key-field {
  display: flex;
  flex-direction: column;
  margin-top: 6px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-color);
}
</style>
