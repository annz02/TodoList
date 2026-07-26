<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Todo } from '../types';

const props = defineProps<{
  isOpen: boolean;
  todos: Todo[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const isGenerating = ref(false);
const showSettings = ref(false);
const apiKey = ref(localStorage.getItem('ai_summary_api_key') || '');
const apiEndpoint = ref(localStorage.getItem('ai_summary_endpoint') || 'https://api.deepseek.com/v1');
const selectedModel = ref(localStorage.getItem('ai_summary_model') || 'deepseek-chat');
const copySuccess = ref(false);

const saveSettings = () => {
  localStorage.setItem('ai_summary_api_key', apiKey.value.trim());
  localStorage.setItem('ai_summary_endpoint', apiEndpoint.value.trim());
  localStorage.setItem('ai_summary_model', selectedModel.value);
  showSettings.value = false;
  generateSummary();
};

// Date helper
const getTodayDateStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Filter today's tasks
const todayTasks = computed(() => {
  const todayStr = getTodayDateStr();
  return props.todos.filter(t => {
    if (t.startTime && t.startTime.startsWith(todayStr)) return true;
    if (t.dueDate && t.dueDate.startsWith(todayStr)) return true;
    if (t.completedAt && t.completedAt === todayStr) return true;
    return false;
  });
});

const completedTodayTasks = computed(() => todayTasks.value.filter(t => t.completed));
const pendingTodayTasks = computed(() => todayTasks.value.filter(t => !t.completed));
const completionRate = computed(() => {
  const total = todayTasks.value.length;
  if (total === 0) return 0;
  return Math.round((completedTodayTasks.value.length / total) * 100);
});

// Generated summary text state
const summaryText = ref('');

// Dynamic helper to generate natural, context-aware task descriptions for built-in mode
const getDynamicTaskDescription = (title: string, category: string): string => {
  const lower = (title + ' ' + category).toLowerCase();
  if (lower.includes('测试') || lower.includes('test')) {
    return '已按计划完成相关测试验证工作，测试结果良好并已同步。';
  }
  if (lower.includes('界面') || lower.includes('ui') || lower.includes('视图') || lower.includes('页面') || lower.includes('布局') || lower.includes('重构')) {
    return '已完成界面交互与样式效果重构，体验提升明显。';
  }
  if (lower.includes('接口') || lower.includes('api') || lower.includes('后端') || lower.includes('服务')) {
    return '已完成接口对接与数据打通，链路运行稳定。';
  }
  if (lower.includes('文档') || lower.includes('需求') || lower.includes('方案') || lower.includes('评审')) {
    return '已完成相关文档梳理与方案确认，核心要点已达成闭环。';
  }
  if (lower.includes('修复') || lower.includes('bug') || lower.includes('排查')) {
    return '已定位并彻底修复相关问题，验证恢复正常。';
  }
  return '已高效推进并完成该事项，成果已顺利闭环。';
};

// Helper function to extract only "今日完成工作汇总" section
const extractTodayCompletedSummary = (text: string): string => {
  if (!text) return '';
  const lines = text.split('\n');
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (startIndex === -1) {
      if (line.includes('一、') && line.includes('今日完成')) {
        startIndex = i;
      }
    } else {
      if (line === '---' || (line.includes('二、') && line.includes('分类进度'))) {
        endIndex = i;
        break;
      }
    }
  }

  if (startIndex !== -1) {
    const sectionLines = lines.slice(startIndex, endIndex !== -1 ? endIndex : lines.length);
    return sectionLines.join('\n').trim();
  }

  return text.trim();
};

// Built-in Summary Generator matching screenshot PixPin_2026-07-26_20-09-34.png (3 Sections)
const generateBuiltInSummary = (): string => {
  const total = todayTasks.value.length;

  if (total === 0) {
    return `**📝 AI 工作日报**

**一、 ✅ 今日完成工作汇总**

  Todolist 分类下今日暂无记录的关键任务。

---

**二、 📊 分类进度追踪**

  - Todolist 分类：今日共纳入0项任务，已完成0项，完成占比0%。

---

**三、 📌 待跟进重点事项**

  - 点击 **新建任务** 开启今日第一条工作规划。`;
  }

  // Group completed tasks by category
  const completedCategoryMap = new Map<string, Todo[]>();
  completedTodayTasks.value.forEach(t => {
    const cat = t.category || 'Todolist';
    if (!completedCategoryMap.has(cat)) {
      completedCategoryMap.set(cat, []);
    }
    completedCategoryMap.get(cat)!.push(t);
  });

  // Section 1 Content
  let section1Content = '';
  if (completedTodayTasks.value.length > 0) {
    section1Content = Array.from(completedCategoryMap.entries())
      .map(([cat, tasks]) => {
        const numText = tasks.length === 1 ? '一' : tasks.length === 2 ? '两' : String(tasks.length);
        const intro = `${cat} 分类下完成以下${numText}项关键任务:`;
        const items = tasks.map(t => `- ${t.title}: ${getDynamicTaskDescription(t.title, cat)}`).join('\n');
        return `${intro}\n${items}`;
      })
      .join('\n\n');
  } else {
    section1Content = '（今日尚无已点击完成的任务事项）';
  }

  // Group all today tasks by category
  const allCategoryMap = new Map<string, { total: number; done: number }>();
  todayTasks.value.forEach(t => {
    const cat = t.category || 'Todolist';
    if (!allCategoryMap.has(cat)) {
      allCategoryMap.set(cat, { total: 0, done: 0 });
    }
    const stat = allCategoryMap.get(cat)!;
    stat.total++;
    if (t.completed) stat.done++;
  });

  // Section 2 Content
  const section2Content = Array.from(allCategoryMap.entries())
    .map(([cat, stat]) => {
      const catRate = Math.round((stat.done / stat.total) * 100);
      return `- ${cat} 分类：今日共纳入${stat.total}项任务，已完成${stat.done}项，完成占比${catRate}%。`;
    })
    .join('\n');

  // Section 3 Content
  let section3Content = '';
  if (pendingTodayTasks.value.length > 0) {
    section3Content = pendingTodayTasks.value
      .map(t => `- ${t.title}：该任务属于 ${t.category || 'Todolist'} 分类，目前仍处于未完成状态。明日需优先处理，确保整体进度不受影响。`)
      .join('\n');
  } else {
    section3Content = '- 今日规划的任务已全部完成，暂无待跟进事项。';
  }

  return `**📝 AI 工作日报**

**一、 ✅ 今日完成工作汇总**

${section1Content}

---

**二、 📊 分类进度追踪**

${section2Content}

---

**三、 📌 待跟进重点事项**

${section3Content}`;
};

// Online LLM API Generator (OpenAI / DeepSeek compatible)
const generateOnlineLLMSummary = async (): Promise<string> => {
  const prompt = `你是一位专业的 AI 工作助手。请根据用户今天的 TodoList 任务数据，写一份包含 3 个核心部分的【AI 工作日报】。不要在段落标题前添加任何 # 井号符号！标题与下文之间必须空一行换行！

【今日任务数据】
- 今日总任务数: ${todayTasks.value.length}
- 已完成任务 (${completedTodayTasks.value.length}项): ${completedTodayTasks.value.map(t => `${t.title} [分类: ${t.category || 'Todolist'}]`).join('; ')}
- 待完成任务 (${pendingTodayTasks.value.length}项): ${pendingTodayTasks.value.map(t => `${t.title} [分类: ${t.category || 'Todolist'}]`).join('; ')}
- 完成率: ${completionRate.value}%

【格式要求 (只包含一、二、三部分，请勿添加 # 井号)】
**📝 AI 工作日报**

**一、 ✅ 今日完成工作汇总**

[分类名称] 分类下完成以下N项关键任务:
- [任务名称]: (请结合该任务的具体名称与分类，由 AI 自由发散撰写一段具体、专业、有针对性的工作成果总结与说明，不要使用固定机械的模板化套话)

---

**二、 📊 分类进度追踪**

- [分类名称] 分类：今日共纳入X项任务，已完成Y项，完成占比Z%。

---

**三、 📌 待跟进重点事项**

- [任务名称]：该任务属于 [分类名称] 分类，目前仍处于未完成状态。明日需优先处理，确保整体进度不受影响。
`;

  const url = apiEndpoint.value.replace(/\/+$/, '') + '/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.value}`
    },
    body: JSON.stringify({
      model: selectedModel.value,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || generateBuiltInSummary();
};

const generateSummary = async () => {
  isGenerating.value = true;
  summaryText.value = '';

  try {
    if (apiKey.value.trim()) {
      summaryText.value = await generateOnlineLLMSummary();
    } else {
      // Simulate smooth typing/loading effect for built-in AI
      await new Promise(r => setTimeout(r, 600));
      summaryText.value = generateBuiltInSummary();
    }
  } catch (err: any) {
    console.warn('Online LLM failed, fallback to built-in:', err);
    summaryText.value = `> ⚠️ 在线模型调用异常 (${err.message || '网络或 Key 错误'})，已自动使用内置智能算法生成总结：\n\n` + generateBuiltInSummary();
  } finally {
    isGenerating.value = false;
  }
};

const copyToClipboard = async () => {
  try {
    const targetText = extractTodayCompletedSummary(summaryText.value);
    await navigator.clipboard.writeText(targetText);
    copySuccess.value = true;
    setTimeout(() => {
      copySuccess.value = false;
    }, 2000);
  } catch (e) {
    console.error('Failed to copy', e);
  }
};

// Generate summary when opened
watch(() => props.isOpen, (newVal) => {
  if (newVal && !summaryText.value) {
    generateSummary();
  }
});
</script>

<template>
  <div class="ai-drawer-overlay" :class="{ open: isOpen }" @click="emit('close')">
    <div class="ai-drawer" :class="{ open: isOpen }" @click.stop>
      
      <!-- Drawer Header -->
      <div class="drawer-header">
        <div class="header-title">
          <span class="ai-sparkle-icon">✨</span>
          <h2>AI 每日任务总结</h2>
        </div>
        <div class="header-actions">
          <button class="icon-btn" @click="showSettings = !showSettings" title="大模型设置">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          </button>
          <button class="icon-btn" @click="emit('close')" title="关闭">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>

      <!-- Optional API Settings Collapsible Box -->
      <div v-if="showSettings" class="api-settings-box">
        <h4>🤖 大模型 API 配置 (支持 DeepSeek / OpenAI)</h4>
        <div class="input-group">
          <label>API Key (留空将使用内置智能算法)</label>
          <input type="password" v-model="apiKey" placeholder="sk-..." />
        </div>
        <div class="input-group">
          <label>API Endpoint</label>
          <input type="text" v-model="apiEndpoint" placeholder="https://api.deepseek.com/v1" />
        </div>
        <div class="input-group">
          <label>Model Name</label>
          <input type="text" v-model="selectedModel" placeholder="deepseek-chat 或 gpt-4o-mini" />
        </div>
        <button class="save-settings-btn" @click="saveSettings">保存并重新生成</button>
      </div>

      <!-- Today Quick Stats Pills -->
      <div class="stats-pills-bar">
        <div class="stat-pill">
          <span class="pill-label">今日计划</span>
          <span class="pill-val">{{ todayTasks.length }} 项</span>
        </div>
        <div class="stat-pill completed">
          <span class="pill-label">已完成</span>
          <span class="pill-val">{{ completedTodayTasks.length }} 项</span>
        </div>
        <div class="stat-pill rate">
          <span class="pill-label">完成率</span>
          <span class="pill-val">{{ completionRate }}%</span>
        </div>
      </div>

      <!-- Summary Content Body -->
      <div class="drawer-body">
        <div v-if="isGenerating" class="loading-state">
          <div class="sparkle-spinner">✨</div>
          <p>AI 正在分析您今天的任务与完成效率...</p>
        </div>

        <div v-else class="summary-markdown-body">
          <div class="markdown-rendered" v-html="renderMarkdown(summaryText)"></div>
        </div>
      </div>

      <!-- Drawer Footer Actions -->
      <div class="drawer-footer">
        <button class="footer-btn regenerate-btn" :disabled="isGenerating" @click="generateSummary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
          重新生成
        </button>
        <button class="footer-btn copy-btn" @click="copyToClipboard">
          <svg v-if="!copySuccess" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
          {{ copySuccess ? '已复制到剪贴板' : '复制总结' }}
        </button>
      </div>

    </div>
  </div>
</template>

<script lang="ts">
// Lightweight Report Markdown Parser with Content Indentation
function renderMarkdown(md: string): string {
  if (!md) return '';

  const lines = md.split('\n');
  let result = '';
  let inSectionContent = false;

  for (let rawLine of lines) {
    let line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (line === '---') {
      if (inSectionContent) {
        result += '</div>';
        inSectionContent = false;
      }
      result += '<hr class="report-divider"/>';
      continue;
    }

    // Check if line is a section title (e.g. **一、 ...** or **📝 ...**)
    if (/^\*\*(📝|[一二三四五六七八九十]、)/.test(line)) {
      if (inSectionContent) {
        result += '</div>';
        inSectionContent = false;
      }
      const titleText = line.replace(/\*\*/g, '');
      result += `<div class="report-title">${titleText}</div>`;
      result += '<div class="report-content">';
      inSectionContent = true;
      continue;
    }

    // Format bold and italic inside content lines
    let formatted = line
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Indent sub-items if starting with ✓ or - or indent spaces
    const isSubItem = rawLine.startsWith('  ') || rawLine.startsWith('\t');
    const lineClass = isSubItem ? 'report-sub-line' : 'report-line';

    if (!inSectionContent) {
      result += '<div class="report-content">';
      inSectionContent = true;
    }

    result += `<div class="${lineClass}">${formatted}</div>`;
  }

  if (inSectionContent) {
    result += '</div>';
  }

  return result;
}
</script>

<style scoped>
.ai-drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  z-index: 100000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.28s ease;
}

.ai-drawer-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.ai-drawer {
  position: fixed;
  top: 0;
  right: -420px;
  width: 400px;
  height: 100vh;
  background-color: var(--bg-main);
  border-left: 1px solid var(--border-color);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.15);
  z-index: 100001;
  display: flex;
  flex-direction: column;
  transition: transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
}

.ai-drawer.open {
  transform: translateX(-420px);
}

/* Drawer Header */
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 38px 20px 16px 20px;
  border-bottom: 1px solid var(--border-color);
  background: linear-gradient(135deg, color-mix(in srgb, var(--primary-color) 8%, transparent), transparent);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ai-sparkle-icon {
  font-size: 20px;
}

.header-title h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.icon-btn:hover {
  background: var(--bg-sidebar);
  color: var(--text-main);
}

/* API Settings Box */
.api-settings-box {
  padding: 16px 20px;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.api-settings-box h4 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-group label {
  font-size: 11.5px;
  color: var(--text-secondary);
}

.input-group input {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-main);
  outline: none;
}

.save-settings-btn {
  background: var(--primary-color);
  color: #fff;
  border: none;
  padding: 7px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  margin-top: 4px;
}

/* Quick Stats Bar */
.stats-pills-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border-color);
  gap: 10px;
}

.stat-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  padding: 6px 8px;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.pill-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.pill-val {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-main);
  margin-top: 2px;
}

.stat-pill.completed .pill-val {
  color: #10b981;
}

.stat-pill.rate .pill-val {
  color: var(--primary-color);
}

/* Drawer Body */
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 240px;
  color: var(--text-secondary);
  gap: 14px;
  text-align: center;
}

.sparkle-spinner {
  font-size: 32px;
  animation: pulseRotate 1.5s infinite linear;
}

@keyframes pulseRotate {
  0% { transform: scale(1) rotate(0deg); opacity: 0.7; }
  50% { transform: scale(1.25) rotate(180deg); opacity: 1; }
  100% { transform: scale(1) rotate(360deg); opacity: 0.7; }
}

.summary-markdown-body {
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--text-main);
}

/* Structured Report CSS with Content Indentation */
.markdown-rendered :deep(.report-title) {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  margin-top: 10px;
  margin-bottom: 8px;
}

.markdown-rendered :deep(.report-content) {
  padding-left: 16px;
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-left: 2px solid color-mix(in srgb, var(--primary-color) 25%, transparent);
}

.markdown-rendered :deep(.report-line) {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-main);
}

.markdown-rendered :deep(.report-sub-line) {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-secondary);
  padding-left: 12px;
}

.markdown-rendered :deep(.report-divider) {
  border: none;
  border-top: 1px dashed var(--border-color);
  margin: 14px 0;
}

.markdown-rendered :deep(blockquote) {
  margin: 10px 0;
  padding: 8px 12px;
  background: var(--bg-sidebar);
  border-left: 3px solid var(--primary-color);
  border-radius: 4px;
  font-size: 12.5px;
  color: var(--text-secondary);
}

/* Drawer Footer */
.drawer-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-sidebar);
}

.footer-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.regenerate-btn {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  color: var(--text-main);
}

.regenerate-btn:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.copy-btn {
  background: var(--primary-color);
  border: none;
  color: #ffffff;
}

.copy-btn:hover {
  opacity: 0.9;
}
</style>
