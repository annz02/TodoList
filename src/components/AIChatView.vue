<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { Todo } from '../types';
import { useAIConfig } from '../composables/useAIConfig';
import { useAIAssistant } from '../composables/useAIAssistant';
import { useChatStream, type ChatMessage } from '../composables/useChatStream';
import { renderMarkdown } from '../utils/markdown';
import { useToast } from '../composables/useToast';

const props = defineProps<{ todos: Todo[] }>();

const { apiKey, endpoint, model, streaming, saveSettings: persistConfig } = useAIConfig();
const { showToast } = useToast();
const { sendChat } = useChatStream();
const assistant = useAIAssistant(computed(() => props.todos));

// Editable copies previewed in the settings panel before saving.
const draftKey = ref(apiKey.value);
const draftEndpoint = ref(endpoint.value);
const draftModel = ref(model.value);
const draftStreaming = ref(streaming.value);

const view = ref<'chat' | 'settings'>('chat');
const input = ref('');
const isWaiting = ref(false);
const abortCtrl = ref<AbortController | null>(null);
const isReportRunning = ref(false);

interface LocalMsg {
  id: number;
  role: 'user' | 'assistant';
  content: string;
}
let idSeq = 1;
const messages = ref<LocalMsg[]>([]);
const scroller = ref<HTMLElement | null>(null);

const helpText = `你好，我是 AI 助手 ✨

我可以：
- **自由对话**：在下方输入框提问，与我进行多轮对话。
- **一键生成工作日报**：点击顶部「今日工作日报」，我会结合你今天的任务与 Git 提交记录为你生成日报。

点右上角 ⚙️ 配置 API Key / Endpoint / Model 后即可获得最佳体验；未配置时会使用内置规则生成简单结果。`;

if (messages.value.length === 0) {
  messages.value.push({ id: idSeq++, role: 'assistant', content: helpText });
}

const scrollToBottom = async () => {
  await nextTick();
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight });
};

const lastAssistant = (): LocalMsg => messages.value[messages.value.length - 1];

const toApiMessages = (): ChatMessage[] => {
  const system = apiKey.value.trim()
    ? '你是 Todolist 内置的 AI 助手，可协助用户整理待办、分析任务、总结每日工作日报。回答请简洁、准确、使用中文。'
    : '你是 Todolist 内置的 AI 助手。当前未配置大模型 API，仅能根据内置规则生成工作日报。请友好提醒用户点击右上角设置配置模型。';
  return [
    { role: 'system', content: system },
    ...messages.value.map((m) => ({ role: m.role, content: m.content })),
  ];
};

/**
 * Run a completion against the current tail assistant message.
 * Pushes an empty assistant message if the last is not empty (never happens in
 * our flows except the direct-report branch which pre-pushes one).
 */
async function streamInto(tail: LocalMsg): Promise<boolean> {
  const ctrl = new AbortController();
  abortCtrl.value = ctrl;
  isWaiting.value = true;
  const stream = streaming.value;
  try {
    const full = await sendChat({
      endpoint: endpoint.value,
      apiKey: apiKey.value,
      model: model.value,
      messages: toApiMessages(),
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
      tail.content += `\n\n> ⚠️ 调用出错：${err?.message || err}\n> 请检查右上角 ⚙️ 配置的 API Key / Endpoint / Model，或网络是否可用。`;
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
  messages.value.push({ id: idSeq++, role: 'user', content: text });
  const tail = { id: idSeq++, role: 'assistant' as const, content: '' };
  messages.value.push(tail);
  await scrollToBottom();

  if (apiKey.value.trim()) {
    await streamInto(tail);
  } else {
    tail.content = '（尚未配置大模型，点右上角 ⚙️ 配置 API Key 后即可与我对话；通用问答需要模型支持。）';
    await scrollToBottom();
  }
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
    showToast('工作日报已生成', 3000, '完成', 'success');
  } catch (err: any) {
    showToast(`生成日报失败：${err?.message || err}`, 4000, '错误', 'warning');
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

// ---------- Settings ----------
const openSettings = () => {
  draftKey.value = apiKey.value;
  draftEndpoint.value = endpoint.value;
  draftModel.value = model.value;
  draftStreaming.value = streaming.value;
  view.value = 'settings';
};

const backToChat = () => {
  view.value = 'chat';
};

const saveConfig = () => {
  persistConfig({
    apiKey: draftKey.value,
    endpoint: draftEndpoint.value,
    model: draftModel.value,
    streaming: draftStreaming.value,
  });
  view.value = 'chat';
  showToast('模型配置已保存', 2500, '完成', 'success');
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
                <div class="md-content" v-html="renderMarkdown(msg.content)"></div>
                <span
                  v-if="isWaiting && msg.id === currentTypingMsg && msg.content === ''"
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
      <div class="chat-inputbar">
        <textarea
          v-model="input"
          rows="1"
          class="input-area"
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          @keydown="onKeydown"
        ></textarea>
        <button v-if="isWaiting" class="send-btn stop" @click="stopGenerating">停止</button>
        <button v-else class="send-btn" :disabled="!input.trim()" @click="sendMessage">发送</button>
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

            <form class="config-card" @submit.prevent="saveConfig">
              <div class="card-section">
                <div class="field">
                  <label class="field-label" for="ai-key">API Key</label>
                  <input
                    id="ai-key"
                    class="field-input mono"
                    type="password"
                    autocomplete="off"
                    spellcheck="false"
                    v-model="draftKey"
                    placeholder="sk-…"
                  />
                  <div class="field-hint" :class="{ tip: draftKey }">
                    {{ draftKey ? '密钥仅保存在本机，不会上传。' : '未填写时将仅使用内置规则生成简单结果。' }}
                  </div>
                </div>

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
                  <label class="field-label" for="ai-model">模型</label>
                  <input
                    id="ai-model"
                    class="field-input mono"
                    type="text"
                    spellcheck="false"
                    v-model="draftModel"
                    placeholder="deepseek-chat / gpt-4o-mini …"
                  />
                  <div class="field-hint">填写所配置端点上可用的模型名称，例如 deepseek-chat、gpt-4o-mini。</div>
                </div>
              </div>

              <div class="card-divider"></div>

              <div class="toggle-row">
                <div class="toggle-text">
                  <span class="toggle-title">流式输出</span>
                  <span class="toggle-desc">逐字显示回复，体验更流畅；关闭则等待完整结果后一次性展示。</span>
                </div>
                <button
                  type="button"
                  class="switch"
                  :class="{ on: draftStreaming }"
                  :aria-pressed="draftStreaming"
                  @click="draftStreaming = !draftStreaming"
                >
                  <span class="switch-knob"></span>
                </button>
              </div>

              <div class="card-actions">
                <button type="button" class="btn-secondary" @click="backToChat">取消</button>
                <button type="submit" class="btn-primary">保存配置</button>
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

/* Form card */
.config-card {
  background: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
}
.card-section { display: flex; flex-direction: column; gap: 16px; }

/* Field stack */
.field { display: flex; flex-direction: column; }
.field-label {
  font-size: 12.5px;
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

/* Divider */
.card-divider { height: 1px; background: var(--border-color); margin: 20px 0; }

/* Toggle row */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.toggle-text { display: flex; flex-direction: column; gap: 3px; }
.toggle-title { font-size: 13px; font-weight: 600; color: var(--text-main); }
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

/* Actions */
.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--border-color);
}
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

/* Input bar */
.chat-inputbar {
  display: flex; align-items: flex-end; gap: 10px; padding-top: 12px;
  border-top: 1px solid var(--border-color);
}
.input-area {
  flex: 1; resize: none; min-height: 40px; max-height: 140px;
  background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: 10px;
  padding: 10px 12px; font-size: 13.5px; color: var(--text-main); outline: none;
  line-height: 1.55;
}
.input-area:focus { border-color: var(--primary-color); }
.send-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  background: var(--primary-color); color: #fff; border: none; padding: 9px 20px;
  border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer;
  transition: opacity .18s ease;
}
.send-btn:disabled { opacity: .55; cursor: not-allowed; }
.send-btn.stop { background: var(--danger-color, #ef4444); }
</style>
