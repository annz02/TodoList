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

const showSettings = ref(false);
const input = ref('');
const isWaiting = ref(false);
const abortCtrl = ref<AbortController | null>(null);
const isReportRunning = ref(false);
const copySuccess = ref(false);

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

// ---------- Misc ----------
const resetConversation = () => {
  abortCtrl.value?.abort();
  abortCtrl.value = null;
  isWaiting.value = false;
  messages.value = [{ id: idSeq++, role: 'assistant', content: helpText }];
};

const copyResult = async () => {
  if (isWaiting.value) return;
  const textToCopy = lastAssistant()?.content || '';
  if (!textToCopy) return;
  try {
    await navigator.clipboard.writeText(textToCopy);
    copySuccess.value = true;
    setTimeout(() => { copySuccess.value = false; }, 1800);
  } catch (e) {
    console.error('copy failed', e);
  }
};

// ---------- Settings ----------
const toggleSettings = () => {
  draftKey.value = apiKey.value;
  draftEndpoint.value = endpoint.value;
  draftModel.value = model.value;
  draftStreaming.value = streaming.value;
  showSettings.value = !showSettings.value;
};

const saveConfig = () => {
  persistConfig({
    apiKey: draftKey.value,
    endpoint: draftEndpoint.value,
    model: draftModel.value,
    streaming: draftStreaming.value,
  });
  showSettings.value = false;
  showToast('模型配置已保存', 2500, '完成', 'success');
};

// Which assistant message is waiting for its first token (drives the typing dots).
const currentTypingMsg = computed(() =>
  isWaiting.value ? (lastAssistant()?.id ?? 0) : 0,
);
</script>

<template>
  <div class="ai-chat">
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
        <button class="tool-btn icon" title="重置会话" @click="resetConversation">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
        </button>
        <button class="tool-btn icon" title="复制最后回复" :disabled="isWaiting" @click="copyResult">
          <svg v-if="!copySuccess" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </button>
        <button
          class="tool-btn icon"
          :class="{ settingsOn: showSettings }"
          title="模型配置"
          @click="toggleSettings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </button>
      </div>
    </div>

    <!-- Settings panel -->
    <Transition name="settings-fade">
      <div v-if="showSettings" class="config-panel">
        <div class="config-row">
          <span class="config-label">API Key <em class="hint">留空时仅内置规则</em></span>
          <input class="config-input" type="password" v-model="draftKey" placeholder="sk-…" />
        </div>
        <div class="config-row">
          <span class="config-label">API Endpoint</span>
          <input class="config-input" type="text" v-model="draftEndpoint" placeholder="https://api.deepseek.com/v1" />
        </div>
        <div class="config-row">
          <span class="config-label">模型</span>
          <input class="config-input" type="text" v-model="draftModel" placeholder="deepseek-chat / gpt-4o-mini …" />
        </div>
        <div class="config-row">
          <span class="config-label">流式输出</span>
          <div class="toggle-switch" :class="{ active: draftStreaming }" @click="draftStreaming = !draftStreaming">
            <div class="toggle-knob"></div>
          </div>
        </div>
        <div class="config-actions">
          <button class="config-save" @click="saveConfig">保存</button>
          <button class="config-cancel" @click="showSettings = false">取消</button>
        </div>
      </div>
    </Transition>

    <!-- Conversation -->
    <div ref="scroller" class="chat-scroll">
      <div class="chat-messages">
        <div v-for="msg in messages" :key="msg.id" class="msg-row" :class="msg.role">
          <div class="avatar" :class="msg.role">
            <svg v-if="msg.role === 'assistant'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"></rect><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line><path d="M9 15h6"></path></svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          </div>
          <div class="bubble" :class="msg.role">
            <template v-if="msg.role === 'assistant'">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div class="md-content" v-html="renderMarkdown(msg.content)"></div>
              <span
                v-if="isWaiting && msg.id === currentTypingMsg && msg.content === ''"
                class="typing"
              >
                <i></i><i></i><i></i>
              </span>
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
.tool-btn.icon.settingsOn,
.tool-btn.settingsOn { background: var(--primary-light); color: var(--primary-color); border-color: transparent; }
.toolbar-actions { display: flex; gap: 6px; }
.tool-btn:disabled { cursor: not-allowed; opacity: .6; }

/* Settings panel */
.config-panel {
  background: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px 16px;
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.config-label {
  font-size: 13px;
  color: var(--text-main);
  font-weight: 500;
  flex-shrink: 0;
  min-width: 140px;
}
.config-label .hint { font-size: 11px; color: var(--text-muted); font-style: normal; display: block; margin-top: 2px; }
.config-input {
  flex: 1;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 12.5px;
  color: var(--text-main);
  outline: none;
  transition: border-color .18s ease;
}
.config-input:focus { border-color: var(--primary-color); }
.toggle-switch {
  width: 42px; height: 23px; background: var(--border-color); border-radius: 12px;
  position: relative; cursor: pointer; transition: background-color .2s ease; flex-shrink: 0;
}
.toggle-switch.active { background-color: var(--primary-color); }
.toggle-knob {
  width: 17px; height: 17px; background: #fff; border-radius: 50%; position: absolute;
  top: 3px; left: 3px; box-shadow: 0 1px 3px rgba(0,0,0,.2); transition: transform .2s ease;
}
.toggle-switch.active .toggle-knob { transform: translateX(19px); }
.config-actions { display: flex; justify-content: flex-end; gap: 8px; }
.config-save {
  background: var(--primary-color); color: #fff; border: none; padding: 6px 18px; border-radius: 8px;
  font-size: 13px; cursor: pointer;
}
.config-cancel {
  background: transparent; border: 1px solid var(--border-color); color: var(--text-secondary);
  padding: 6px 16px; border-radius: 8px; font-size: 13px; cursor: pointer;
}
.settings-fade-enter-active, .settings-fade-leave-active { transition: opacity .18s ease, transform .18s ease; }
.settings-fade-enter-from, .settings-fade-leave-to { opacity: 0; transform: translateY(-4px); }

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
.bubble.assistant { background: var(--bg-sidebar); border: 1px solid var(--border-color); border-top-left-radius: 4px; }
.bubble.user { background: var(--primary-color); color: #fff; border-top-right-radius: 4px; }
.user-content { margin: 0; white-space: pre-wrap; font-family: inherit; font-size: 13.5px; color: inherit; }

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
