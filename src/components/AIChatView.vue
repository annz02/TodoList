<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { Todo } from '../types';
import { useAIConfig } from '../composables/useAIConfig';
import { useConversations, type AgentStep, type LocalMsg } from '../composables/useConversations';
import { useAIAssistant } from '../composables/useAIAssistant';
import { useChatStream, type ChatMessage, type ToolDefinition } from '../composables/useChatStream';
import { useWebSearch } from '../composables/useWebSearch';
import { renderMarkdown, cleanDSMLTags } from '../utils/markdown';

const props = defineProps<{ todos: Todo[] }>();
const emit = defineEmits<{
  (e: 'create-task', task: { title: string; category?: string; dueDate?: string; startTime?: string; priority?: number; reminderOption?: string; repeatOption?: string }): void;
  (e: 'batch-create-tasks', tasks: Array<{ title: string; category?: string; dueDate?: string; startTime?: string; priority?: number; reminderOption?: string; repeatOption?: string }>): void;
  (e: 'complete-task', taskTitleOrId: string): void;
  (e: 'reopen-task', taskTitleOrId: string): void;
  (e: 'delete-task', taskTitleOrId: string): void;
  (e: 'clear-completed-tasks'): void;
  (e: 'update-task', data: { taskTitleOrId: string; newTitle?: string; newCategory?: string; newDueDate?: string; newStartTime?: string; newPriority?: number; newReminderOption?: string; newRepeatOption?: string }): void;
  (e: 'restore-last-deleted', callback?: (res: { count: number; titles: string[] }) => void): void;
  (e: 'open-settings', tab?: 'general' | 'ai' | 'shortcuts'): void;
}>();

const {
  apiKey,
  models,
  connection,
  streaming,
  webSearch,
  searchEngine,
  tavilyApiKey,
  bochaApiKey,
  setActiveModel,
  setWebSearch,
} = useAIConfig();
const { sendChat } = useChatStream();
const { search, fetchWebpage } = useWebSearch();
const assistant = useAIAssistant(computed(() => props.todos));

const getCurrentNowISO = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const LOCAL_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: '在用户的 Todolist 中新建一条待办任务。前置要求：用户需明确提供开始时间或截止时间（或明确表示不设时间）。若用户尚未提供起止时间，切勿直接调用此工具，应先主动询问用户的起止时间安排。',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '待办任务的标题，例如“开发todolist”',
          },
          category: {
            type: 'string',
            description: '任务分类，如“工作”、“开发”、“学习”、“生活”等',
          },
          startTime: {
            type: 'string',
            description: '任务开始时间，格式为 YYYY-MM-DDTHH:mm（选填，若用户未提供请先询问）',
          },
          dueDate: {
            type: 'string',
            description: '任务截止时间，格式为 YYYY-MM-DDTHH:mm（选填，若用户未提供请先询问）',
          },
          priority: {
            type: 'number',
            description: '任务优先级（1: 低, 2: 中, 3: 高，选填）',
          },
          reminderOption: {
            type: 'string',
            description: '提前提醒选项，例如 none/5min/15min/30min/1hour/1day（选填）',
          },
          repeatOption: {
            type: 'string',
            description: '重复规则，例如 none/daily/workday/weekly/monthly（选填）',
          },
          noTimeConfirmed: {
            type: 'boolean',
            description: '用户是否已明确说明不需要设置时间/不设时间（选填）',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_create_tasks',
      description: '在 Todolist 中批量一次性新建多条待办任务。前置要求：任务列表中已包含时间信息，或用户已明确确认无需设置时间。若用户未提供时间，请先向用户询问时间安排。',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            description: '待创建的任务列表',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: '任务标题' },
                category: { type: 'string', description: '任务分类' },
                startTime: { type: 'string', description: '开始时间 YYYY-MM-DDTHH:mm' },
                dueDate: { type: 'string', description: '截止时间 YYYY-MM-DDTHH:mm' },
                priority: { type: 'number', description: '优先级 1/2/3' },
                reminderOption: { type: 'string', description: '提醒规则' },
                repeatOption: { type: 'string', description: '重复规则' },
              },
              required: ['title'],
            },
          },
          noTimeConfirmed: {
            type: 'boolean',
            description: '用户是否已明确说明不需要设置时间/不设时间（选填）',
          },
        },
        required: ['tasks'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: '修改用户 Todolist 中某项已有任务的标题、分类、开始时间、截止时间、优先级、提醒或重复规则。',
      parameters: {
        type: 'object',
        properties: {
          taskTitleOrId: {
            type: 'string',
            description: '要修改的目标任务的原标题、关键词或任务 ID',
          },
          newTitle: {
            type: 'string',
            description: '修改后的新标题（选填）',
          },
          newCategory: {
            type: 'string',
            description: '修改后的新分类（选填）',
          },
          newStartTime: {
            type: 'string',
            description: '修改后的开始时间 YYYY-MM-DDTHH:mm（选填）',
          },
          newDueDate: {
            type: 'string',
            description: '修改后的截止时间 YYYY-MM-DDTHH:mm（选填）',
          },
          newPriority: {
            type: 'number',
            description: '修改后的优先级 1:低 / 2:中 / 3:高（选填）',
          },
          newReminderOption: {
            type: 'string',
            description: '修改后的提醒选项（选填）',
          },
          newRepeatOption: {
            type: 'string',
            description: '修改后的重复规则（选填）',
          },
        },
        required: ['taskTitleOrId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: '将用户 Todolist 中的某项待办任务标记为已完成。',
      parameters: {
        type: 'object',
        properties: {
          taskTitleOrId: {
            type: 'string',
            description: '要标记完成的任务标题、关键词或任务 ID',
          },
        },
        required: ['taskTitleOrId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reopen_task',
      description: '重新打开/激活某项已完成的任务，将其状态恢复为未完成待办。当用户说“重新做xx”、“把xx重新标记为未完成”时调用。',
      parameters: {
        type: 'object',
        properties: {
          taskTitleOrId: {
            type: 'string',
            description: '要重新激活的任务标题、关键词或任务 ID',
          },
        },
        required: ['taskTitleOrId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: '从用户的 Todolist 中删除某项待办任务。',
      parameters: {
        type: 'object',
        properties: {
          taskTitleOrId: {
            type: 'string',
            description: '要删除的任务标题、关键词或任务 ID',
          },
        },
        required: ['taskTitleOrId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_completed_tasks',
      description: '清空/删除用户的全部已完成历史任务。当用户要求“清空已完成”、“删除所有做完的任务”时调用。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'restore_last_deleted',
      description: '撤销最近一次的删除操作，恢复刚被删除的任务。当用户说“撤销刚才的删除”、“恢复刚才删掉的任务”、“撤回”时调用。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_tasks',
      description: '灵活查询与检索用户的任务列表。支持按时间范围（today/tomorrow/this_week/all/具体日期）、状态（pending/completed/all）、分类、关键词或优先级综合筛选。',
      parameters: {
        type: 'object',
        properties: {
          dateRange: {
            type: 'string',
            description: '日期范围：today(今天) / tomorrow(明天) / this_week(本周) / all(全部) / YYYY-MM-DD(指定日期)，选填',
          },
          status: {
            type: 'string',
            description: '任务状态：pending(待办未完成) / completed(已完成) / all(全部)，选填，默认 all',
          },
          category: {
            type: 'string',
            description: '分类过滤（如 工作 / 生活 / 学习 等），选填',
          },
          keyword: {
            type: 'string',
            description: '任务标题搜索关键词，选填',
          },
          priority: {
            type: 'number',
            description: '优先级筛选 1/2/3，选填',
          },
          limit: {
            type: 'number',
            description: '最多返回的任务数量（默认 30，最大 50），防止结果过多超出上下文',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_today_tasks',
      description: '快速查询用户在当前 Todolist 中的今日任务列表详情与完成率。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

const WEB_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '在互联网上搜索最新资讯、实时天气、新闻热点或外部实时事实。当你需要了解最新的事实数据时调用此工具。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '提纯后的核心搜索关键词短语，去除“今天有什么”、“请帮我查”等口语化停用词',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_webpage',
      description: '深入阅读某一个具体网页链接的完整正文内容。当搜索结果摘要不够详尽或需要获取文章深层细节时调用。',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '网页完整链接 URL（通常来自 web_search 返回的 link 字段）',
          },
        },
        required: ['url'],
      },
    },
  },
];

const getActiveTools = () => {
  return webSearch.value ? [...LOCAL_TOOLS, ...WEB_TOOLS] : [...LOCAL_TOOLS];
};

function parseDSMLToolCalls(text: string) {
  const calls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = [];
  const invokeRegex = /<[|｜]DSML[|｜]invoke\s+name="([^"]+)">([\s\S]*?)<\/[|｜]DSML[|｜]invoke>/g;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = invokeRegex.exec(text)) !== null) {
    const name = match[1];
    const body = match[2];
    const paramRegex = /<[|｜]DSML[|｜]parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/[|｜]DSML[|｜]parameter>/g;
    const args: Record<string, string> = {};
    let pMatch: RegExpExecArray | null;
    while ((pMatch = paramRegex.exec(body)) !== null) {
      args[pMatch[1]] = pMatch[2].trim();
    }
    calls.push({
      id: `call_dsml_${Date.now()}_${idx++}`,
      type: 'function',
      function: {
        name,
        arguments: JSON.stringify(args),
      },
    });
  }
  return calls;
}

function normalizeTaskName(s: string): string {
  return s
    .replace(/[「」【】“”"'\s\t`·]/g, '')
    .replace(/(任务|待办|事项)$/, '')
    .toLowerCase();
}

function matchesDateRange(t: Todo, dateRange?: string, now: Date = new Date()): boolean {
  if (!dateRange || dateRange === 'all') return true;

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomY = tomorrowDate.getFullYear();
  const tomM = String(tomorrowDate.getMonth() + 1).padStart(2, '0');
  const tomD = String(tomorrowDate.getDate()).padStart(2, '0');
  const tomorrowStr = `${tomY}-${tomM}-${tomD}`;

  let rangeStart = '';
  let rangeEnd = '';

  if (dateRange === 'today') {
    rangeStart = todayStr;
    rangeEnd = todayStr;
  } else if (dateRange === 'tomorrow') {
    rangeStart = tomorrowStr;
    rangeEnd = tomorrowStr;
  } else if (dateRange === 'this_week') {
    const dayOfWeek = now.getDay() || 7; // 1 (Mon) to 7 (Sun)
    const mon = new Date(now.getTime() - (dayOfWeek - 1) * 24 * 60 * 60 * 1000);
    const sun = new Date(now.getTime() + (7 - dayOfWeek) * 24 * 60 * 60 * 1000);
    rangeStart = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
    rangeEnd = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`;
  } else if (dateRange === 'this_month') {
    const firstDay = `${yyyy}-${mm}-01`;
    const lastDate = new Date(yyyy, Number(mm), 0).getDate();
    rangeStart = firstDay;
    rangeEnd = `${yyyy}-${mm}-${String(lastDate).padStart(2, '0')}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateRange)) {
    rangeStart = dateRange;
    rangeEnd = dateRange;
  } else {
    return true;
  }

  const getDayStr = (iso?: string) => (iso ? iso.slice(0, 10) : '');
  const taskStart = getDayStr(t.startTime);
  const taskDue = getDayStr(t.dueDate);
  const taskCompleted = getDayStr(t.completedAt);

  // If task is completed and has completedAt date
  if (t.completed && taskCompleted) {
    if (taskCompleted >= rangeStart && taskCompleted <= rangeEnd) return true;
  }

  // Interval overlap: [taskStart, taskDue] overlaps [rangeStart, rangeEnd]
  if (taskStart && taskDue) {
    return taskStart <= rangeEnd && taskDue >= rangeStart;
  }
  if (taskStart && !taskDue) {
    return taskStart <= rangeEnd;
  }
  if (!taskStart && taskDue) {
    return taskDue >= rangeStart;
  }
  return true;
}

function formatTodoDetail(t: Todo) {
  return {
    id: t.id,
    title: t.title,
    category: t.category || '默认',
    completed: t.completed,
    status: t.completed ? '已完成' : '待办进行中',
    startTime: t.startTime || undefined,
    dueDate: t.dueDate || undefined,
    timeText: t.timeText || undefined,
    priority: t.priority === 3 ? '高' : t.priority === 2 ? '中' : t.priority === 1 ? '低' : '无',
    reminderOption: t.reminderOption || undefined,
    repeatOption: t.repeatOption || undefined,
    completedAt: t.completedAt || undefined,
    gitUrl: t.gitUrl || undefined,
  };
}

interface MatchResult {
  match?: Todo;
  ambiguous?: boolean;
  candidates?: Todo[];
}

function findMatchingTasks(tasks: Todo[], query: string): MatchResult {
  if (!query) return {};
  const raw = query.trim();
  // 1. Direct ID match
  const byId = tasks.find((x) => x.id === raw);
  if (byId) return { match: byId };

  const cleanQ = normalizeTaskName(raw);
  if (!cleanQ) return {};

  // 2. Exact clean title match
  const exactMatches = tasks.filter((x) => normalizeTaskName(x.title) === cleanQ);
  if (exactMatches.length === 1) {
    return { match: exactMatches[0] };
  }
  if (exactMatches.length > 1) {
    return { ambiguous: true, candidates: exactMatches };
  }

  // 3. Bidirectional inclusion match
  const partialMatches = tasks.filter((x) => {
    const cleanT = normalizeTaskName(x.title);
    if (!cleanT) return false;
    return cleanT.includes(cleanQ) || cleanQ.includes(cleanT);
  });
  if (partialMatches.length === 1) {
    return { match: partialMatches[0] };
  }
  if (partialMatches.length > 1) {
    return { ambiguous: true, candidates: partialMatches };
  }

  return {};
}

// Whether the in-place model dropdown in the chat footer is open.
const modelPickerOpen = ref(false);

const activeModelName = computed(() => connection.value.model);

const input = ref('');
const isWaiting = ref(false);
const abortCtrl = ref<AbortController | null>(null);

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
  // Only open http(s) links. Prevents shell injection / local-file launching if
  // an untrusted (e.g. search-derived) URL ever ends up here.
  const raw = (url || '').trim();
  if (!/^https?:\/\//i.test(raw)) return;
  try {
    await invoke('open_url', { url: raw });
  } catch {
    window.open(raw, '_blank');
  }
};

const toggleWebSearch = () => {
  setWebSearch(!webSearch.value);
};

// Conversation roster lives in the module-singleton useConversations store so
// it survives navigating away from the ai-chat page (component unmount) and back.
const conversations = useConversations();
// Alias to the active conversation's messages array. Read/write is unchanged:
// the store exposes the exact array of the currently active conversation and
// mutations (push, element field writes) trigger the v-for below.
const messages = conversations.messages;
const nextMessageId = conversations.nextMessageId;
const refreshConversationTitle = conversations.refreshLabelIfUntitled;
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

const scrollToBottom = async () => {
  await nextTick();
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight });
};

// Clear per-conversation transient UI when switching to another conversation.
watch(
  () => conversations.activeId.value,
  () => {
    openSourceMsgIds.value = [];
    copiedMsgId.value = null;
    input.value = '';
  },
);

const lastAssistant = (): LocalMsg => messages.value[messages.value.length - 1];

/**
 * Antigravity Agentic Loop: executes multi-turn tool calling autonomously.
 *
 * `extraContext` (optional) is injected into the outgoing API conversation right
 * after the system prompt, but is NOT shown in the chat UI. It lets the daily
 * report feed the structured task/data prompt to the model while keeping the
 * visible user bubble short.
 */
async function streamInto(tail: LocalMsg, extraContext: ChatMessage[] = []): Promise<boolean> {
  const ctrl = new AbortController();
  abortCtrl.value = ctrl;
  isWaiting.value = true;
  const stream = streaming.value;
  const cfg = connection.value;

  const now = new Date();
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${['日', '一', '二', '三', '四', '五', '六'][now.getDay()]}`;

  const system = apiKey.value.trim()
    ? `你是 Todolist 中的待办助手，由用户配置的大模型服务驱动。当前接入地址：${cfg.endpoint}；当前使用模型：${cfg.model}。当前时间：${dateStr}。\n【身份如实准则】：当被问到你是什么模型、由谁驱动、基于什么架构或框架时，请如实说明你是由用户配置的大模型服务（接入地址 ${cfg.endpoint}、模型 ${cfg.model}）驱动的待办助手，不要自称使用任何未用户配置或虚构的框架、架构或底层模型。\n【工具能力】：你可为用户调用丰富的待办管理与网络工具：\n- create_task: 新建单条待办任务（支持标题、分类、开始时间、截止时间、优先级1-3、提醒与重复）；\n- batch_create_tasks: 批量新建多条待办任务（适合用户提出多项规划或任务列表时一次性创建）；\n- update_task: 修改已有待办的标题、分类、起止时间、截止时间、优先级、提醒或重复；\n- complete_task: 标记待办任务为已完成；\n- reopen_task: 重新打开/激活已完成的待办任务，将其恢复为未完成状态；\n- delete_task: 从列表中删除指定待办；\n- clear_completed_tasks: 一键清空所有已完成的历史任务；\n- restore_last_deleted: 撤销最近一次删除操作，恢复刚被删除的任务；\n- query_tasks: 灵活查询/筛选任务（支持按日期范围 today/tomorrow/this_week/all/具体日期、按状态 pending/completed/all、按分类、按关键词、优先级和数量限制检索）；\n- get_today_tasks: 快速查询今日任务详情与完成率；\n- web_search / fetch_webpage: 联网检索与网页深度阅读。\n【新建任务时间确认准则（核心规则，务必严格遵守）】：\n- 当用户要求创建/新建待办任务（例如“帮我建一个任务：写周报”、“添加待办买菜”）时：\n  1) 检查用户输入中是否包含了明确的【开始时间】或【结束/截止时间】（包括“明天上午10点到12点”、“今天下午3点前完成”、“从9月5日到9月8日”等具体或相对时间）；\n  2) 如果用户【未提供开始时间与结束时间】且未说明“不设时间”：\n     - 严禁擅自直接调用 create_task 或 batch_create_tasks；\n     - 必须先在回复中礼貌询问用户，例如：“好的，请问「[任务名称]」的**开始时间**和**截止/结束时间**分别安排在什么时候呢？（例如：今天下午 14:00 至 17:00，或明天截止；如果不需要设置时间也可直接告诉我）”；\n  3) 只有当用户在初次请求中已包含时间、在后续回复中补充了时间，或者用户明确表示“不需要时间/不用设时间”时，才调用 create_task / batch_create_tasks 完成创建。\n【操作准则与安全性】：\n1) 当用户提出增、删、改、查、重新激活、批量添加、撤销恢复或清空已完成的诉求时，请在满足前置条件后直接调用对应工具执行；\n2) 消歧确认：若工具返回 ambiguous（匹配到多条候选任务），请向用户友好列出候选任务并请求用户指明具体要操作哪一项，切勿擅自修改或删除；\n3) 回答请准确、专业、友好并使用中文。\n【排版要求（务必遵守）】：回答务必注重条理与可读性。\n1) 如果内容包含多个方面或步骤，先用 **加粗小节标题**（如 **一、要点分析**、**二、建议**）分节；\n2) 并列要点一律用行首符号 - 或有序 1. 2. 列表逐条列出，不要把它们吞进同一句话里；\n3) 段落与条目之间用空行分隔，不要输出连续一整段拥挤的文字墙；\n4) 不确定或有取舍时给出简短小结；内容简短时 1-3 条即可，不必强行堆砌。`
    : '你是 Todolist 的待办助手。当前未配置大模型 API，无法进行通用问答与在线推理；当被问到你是什么模型或由什么驱动时，请如实说明当前由软件内置规则驱动，并友好提醒用户先点击左下角 ⚙️「设置」完成模型配置，即可获得模型驱动的完整问答。如果你在生成日报，请按有结构、分段、分点的条理输出。';

  // Only feed the most recent turns to the model, so very long chats don't
  // overflow the context window nor re-inject stale raw tool/step walls. Each
  // past assistant bubble carries only its final rendered text (DSML already
  // stripped), which is all the model needs to stay coherent.
  const HISTORY_TURNS = 20;
  const beforeCurrent = messages.value.slice(0, -1);
  const trimmedHistory = beforeCurrent.slice(-HISTORY_TURNS).map((m) => ({
    role: m.role as 'system' | 'user' | 'assistant' | 'tool',
    content: cleanDSMLTags(m.content),
  }));

  const conversation: ChatMessage[] = [
    { role: 'system', content: system },
    ...extraContext,
    ...trimmedHistory,
  ];

  try {
    let toolTurn = 0;
    // Allow real chained tool calls: each turn the model may call several
    // tools, then see their results and either answer directly (returns early,
    // line ~413) or continue chaining (web_search -> fetch_webpage -> ...).
    // 4 turns is enough for typical multi-hop research while staying bounded
    // so the in-memory conversation doesn't grow unboundedly or cost too much.
    const MAX_TOOL_TURNS = 4;

    while (toolTurn < MAX_TOOL_TURNS) {
      toolTurn++;
      const tools = getActiveTools();

      const result = await sendChat({
        endpoint: cfg.endpoint,
        apiKey: cfg.apiKey,
        model: cfg.model,
        messages: conversation,
        tools,
        stream,
        signal: ctrl.signal,
        onChunk: (chunk) => {
          tail.content += chunk;
          scrollToBottom();
        },
      });

      // 检查是否有标准 API toolCalls，或内容中是否包含 DeepSeek DSML 标签
      let toolCalls = result.toolCalls;
      if ((!toolCalls || toolCalls.length === 0) && result.content && result.content.includes('DSML')) {
        const dsmlCalls = parseDSMLToolCalls(result.content);
        if (dsmlCalls.length > 0) {
          toolCalls = dsmlCalls;
        }
      }

      // 如果模型没有发起任何工具调用，说明已给出了直接回复！
      if (!toolCalls || toolCalls.length === 0) {
        // Replace whatever came back with the final content (stream already
        // appended via onChunk). Non-streaming replies read result.content once.
        if (!stream && result.content) tail.content = result.content;
        if (cleanDSMLTags(tail.content) === '') {
          // No usable answer (empty reply in either mode). Surface a helpful
          // hint instead of a blank bubble.
          tail.content =
            result.content ||
            '（模型未返回可显示的内容：可能是请求被限流、上下文过长被截断，或该模型未正常应答。可稍后重试，或将问题说得更简短具体。）';
        }
        tail.content = cleanDSMLTags(tail.content);
        await scrollToBottom();
        return true;
      }

      // 记录模型的工具调用意图
      const cleanContent = cleanDSMLTags(result.content);
      conversation.push({
        role: 'assistant',
        content: cleanContent || '',
        tool_calls: toolCalls,
      });
      tail.content = '';

      for (const call of toolCalls) {
        if (ctrl.signal.aborted) break;
        const toolName = call.function.name;
        let args: any = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          args = {};
        }

        if (!tail.steps) tail.steps = [];

        if (toolName === 'create_task') {
          const title = (args.title || '').trim();
          const category = (args.category || '工作').trim();
          const rawStartTime = (args.startTime || '').trim();
          const rawDueDate = (args.dueDate || '').trim();
          const noTimeConfirmed = Boolean(args.noTimeConfirmed);
          const priority = args.priority !== undefined ? Number(args.priority) : undefined;
          const reminderOption = (args.reminderOption || '').trim() || undefined;
          const repeatOption = (args.repeatOption || '').trim() || undefined;

          const step: AgentStep = {
            name: 'create_task',
            title: `创建待办任务：「${title || '新任务'}」`,
            status: 'running',
          };
          tail.steps.push(step);
          await scrollToBottom();

          if (!title) {
            step.status = 'error';
            step.title = '创建任务失败：缺少标题';
            await scrollToBottom();
            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({ success: false, error: '缺少任务标题' }),
            });
          } else if (!rawStartTime && !rawDueDate && !noTimeConfirmed) {
            step.status = 'error';
            step.title = `创建未执行：需要向用户确认起止时间`;
            await scrollToBottom();
            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: false,
                needTimeConfirmation: true,
                message: `创建未执行：用户尚未提供任务「${title}」的开始时间或截止时间。请在最终回答中主动询问用户：“请问「${title}」的开始时间和截止时间分别安排在什么时候呢？（例如：今天下午 14:00 至 17:00，或明天截止；如果不需要设置时间也可以直接告诉我）”。`,
              }),
            });
          } else {
            const startTime = rawStartTime || (rawDueDate ? getCurrentNowISO() : undefined);
            const dueDate = rawDueDate || undefined;
            const hasDup = props.todos.some(
              (t) => !t.completed && normalizeTaskName(t.title) === normalizeTaskName(title),
            );
            const dupWarning = hasDup ? `（提示：列表中已有同名未完成任务「${title}」）` : '';

            emit('create-task', {
              title,
              category,
              startTime,
              dueDate,
              priority,
              reminderOption,
              repeatOption,
            });
            step.status = 'done';
            step.title = `已创建待办任务：「${title}」${category ? ` · ${category}` : ''}${hasDup ? ' (已有同名)' : ''}`;
            await scrollToBottom();

            const timeDesc = startTime && dueDate ? `${startTime} ~ ${dueDate}` : startTime ? `开始于 ${startTime}` : dueDate ? `截止于 ${dueDate}` : '未指定具体起止时间';

            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: true,
                hasDuplicate: hasDup,
                message: `待办任务「${title}」已成功创建并保存！分类：${category}，时间：${timeDesc}${priority ? `，优先级：${priority === 3 ? '高' : priority === 2 ? '中' : '低'}` : ''}。${dupWarning}`,
              }),
            });
          }
        } else if (toolName === 'batch_create_tasks') {
          const rawTasks = Array.isArray(args.tasks) ? args.tasks : [];
          const noTimeConfirmed = Boolean(args.noTimeConfirmed);
          const validTasks = rawTasks
            .filter((x: any) => x && typeof x.title === 'string' && x.title.trim())
            .map((x: any) => {
              const sTime = (x.startTime || '').trim();
              const dDate = (x.dueDate || '').trim();
              return {
                title: x.title.trim(),
                category: (x.category || '工作').trim(),
                startTime: sTime || (dDate ? getCurrentNowISO() : undefined),
                dueDate: dDate || undefined,
                priority: x.priority !== undefined ? Number(x.priority) : undefined,
                reminderOption: (x.reminderOption || '').trim() || undefined,
                repeatOption: (x.repeatOption || '').trim() || undefined,
                hasExplicitTime: Boolean(sTime || dDate),
              };
            });

          const step: AgentStep = {
            name: 'batch_create_tasks',
            title: `批量创建 ${validTasks.length} 项待办任务`,
            status: 'running',
          };
          tail.steps.push(step);
          await scrollToBottom();

          if (validTasks.length === 0) {
            step.status = 'error';
            step.title = '批量创建失败：未提供有效任务列表';
            await scrollToBottom();
            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({ success: false, error: '未提供有效任务列表' }),
            });
          } else if (validTasks.every((t: any) => !t.hasExplicitTime) && !noTimeConfirmed) {
            step.status = 'error';
            step.title = `批量创建未执行：需要向用户确认起止时间`;
            await scrollToBottom();
            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: false,
                needTimeConfirmation: true,
                message: `批量创建未执行：用户尚未提供这些任务的具体起止时间安排。请在最终回答中向用户询问这些任务的时间规划（或提示若无需设置时间可直接确认）。`,
              }),
            });
          } else {
            emit('batch-create-tasks', validTasks);
            step.status = 'done';
            step.title = `已批量创建 ${validTasks.length} 项待办任务：${validTasks.map((t: { title: string }) => t.title).join('、')}`;
            await scrollToBottom();

            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: true,
                count: validTasks.length,
                message: `成功批量创建 ${validTasks.length} 条待办任务：${validTasks.map((t: { title: string }) => `「${t.title}」`).join('、')}！`,
              }),
            });
          }
        } else if (toolName === 'update_task') {
          const taskTitleOrId = (args.taskTitleOrId || '').trim();
          const newTitle = (args.newTitle || '').trim();
          const newCategory = (args.newCategory || '').trim();
          const newStartTime = (args.newStartTime || '').trim();
          const newDueDate = (args.newDueDate || '').trim();
          const newPriority = args.newPriority !== undefined ? Number(args.newPriority) : undefined;
          const newReminderOption = (args.newReminderOption || '').trim();
          const newRepeatOption = (args.newRepeatOption || '').trim();

          const step: AgentStep = {
            name: 'update_task',
            title: `修改待办任务：「${taskTitleOrId}」`,
            status: 'running',
          };
          tail.steps.push(step);
          await scrollToBottom();

          const matchRes = findMatchingTasks(props.todos, taskTitleOrId);
          if (matchRes.ambiguous && matchRes.candidates) {
            const listDesc = matchRes.candidates
              .map((t) => `「${t.title}」(分类: ${t.category || '默认'}, ${t.completed ? '已完成' : '待办'})`)
              .join('、');
            step.status = 'error';
            step.title = `修改未执行：匹配到 ${matchRes.candidates.length} 个相似任务需确认`;
            await scrollToBottom();

            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: false,
                ambiguous: true,
                candidates: matchRes.candidates.map(formatTodoDetail),
                message: `未执行修改：检索到多条相似任务（${listDesc}）。请向用户列出这些选项并询问用户具体要修改哪一项。`,
              }),
            });
          } else if (matchRes.match) {
            const target = matchRes.match;
            emit('update-task', {
              taskTitleOrId: target.id,
              newTitle: newTitle || undefined,
              newCategory: newCategory || undefined,
              newStartTime: newStartTime || undefined,
              newDueDate: newDueDate || undefined,
              newPriority: newPriority !== undefined ? newPriority : undefined,
              newReminderOption: newReminderOption || undefined,
              newRepeatOption: newRepeatOption || undefined,
            });
            step.status = 'done';
            step.title = `已修改待办任务：「${newTitle || target.title}」`;
            await scrollToBottom();

            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: true,
                message: `待办任务「${target.title}」已成功更新！${newTitle ? `新标题：${newTitle}；` : ''}${newCategory ? `新分类：${newCategory}；` : ''}${newDueDate ? `新截止时间：${newDueDate}；` : ''}${newPriority ? `新优先级：${newPriority === 3 ? '高' : newPriority === 2 ? '中' : '低'}；` : ''}`,
              }),
            });
          } else {
            step.status = 'error';
            step.title = `未找到待修改任务：「${taskTitleOrId}」`;
            await scrollToBottom();
            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: false,
                error: `未在待办列表中找到任务「${taskTitleOrId}」，当前已有任务：${props.todos.map((t) => t.title).join('、') || '暂无'}`,
              }),
            });
          }
        } else if (toolName === 'complete_task') {
          const taskTitleOrId = (args.taskTitleOrId || '').trim();
          const step: AgentStep = {
            name: 'complete_task',
            title: `标记任务完成：「${taskTitleOrId}」`,
            status: 'running',
          };
          tail.steps.push(step);
          await scrollToBottom();

          const matchRes = findMatchingTasks(props.todos, taskTitleOrId);
          if (matchRes.ambiguous && matchRes.candidates) {
            const listDesc = matchRes.candidates
              .map((t) => `「${t.title}」(分类: ${t.category || '默认'}, ${t.completed ? '已完成' : '待办'})`)
              .join('、');
            step.status = 'error';
            step.title = `标记完成未执行：匹配到 ${matchRes.candidates.length} 个相似任务需确认`;
            await scrollToBottom();

            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: false,
                ambiguous: true,
                candidates: matchRes.candidates.map(formatTodoDetail),
                message: `未执行操作：检索到多条相似任务（${listDesc}）。请向用户列出这些选项并询问用户具体要完成哪一项。`,
              }),
            });
          } else if (matchRes.match) {
            const target = matchRes.match;
            emit('complete-task', target.id);
            step.status = 'done';
            step.title = `已将任务标记为完成：「${target.title}」`;
            await scrollToBottom();

            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: true,
                message: `待办任务「${target.title}」已成功标记为完成！`,
              }),
            });
          } else {
            step.status = 'error';
            step.title = `未找到待完成任务：「${taskTitleOrId}」`;
            await scrollToBottom();
            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: false,
                error: `未在待办列表中找到任务「${taskTitleOrId}」，当前已有任务：${props.todos.map((t) => t.title).join('、') || '暂无'}`,
              }),
            });
          }
        } else if (toolName === 'reopen_task') {
          const taskTitleOrId = (args.taskTitleOrId || '').trim();
          const step: AgentStep = {
            name: 'reopen_task',
            title: `重新激活待办任务：「${taskTitleOrId}」`,
            status: 'running',
          };
          tail.steps.push(step);
          await scrollToBottom();

          const matchRes = findMatchingTasks(props.todos, taskTitleOrId);
          if (matchRes.ambiguous && matchRes.candidates) {
            const listDesc = matchRes.candidates
              .map((t) => `「${t.title}」(分类: ${t.category || '默认'}, ${t.completed ? '已完成' : '待办'})`)
              .join('、');
            step.status = 'error';
            step.title = `恢复待办未执行：匹配到 ${matchRes.candidates.length} 个相似任务需确认`;
            await scrollToBottom();

            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: false,
                ambiguous: true,
                candidates: matchRes.candidates.map(formatTodoDetail),
                message: `未执行操作：检索到多条相似任务（${listDesc}）。请向用户列出这些选项并询问用户具体要恢复哪一项。`,
              }),
            });
          } else if (matchRes.match) {
            const target = matchRes.match;
            emit('reopen-task', target.id);
            step.status = 'done';
            step.title = `已恢复待办任务：「${target.title}」`;
            await scrollToBottom();

            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: true,
                message: `已将任务「${target.title}」重新标记为未完成待办！`,
              }),
            });
          } else {
            step.status = 'error';
            step.title = `未找到待激活任务：「${taskTitleOrId}」`;
            await scrollToBottom();
            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: false,
                error: `未在列表中找到任务「${taskTitleOrId}」`,
              }),
            });
          }
        } else if (toolName === 'delete_task') {
          const taskTitleOrId = (args.taskTitleOrId || '').trim();
          const step: AgentStep = {
            name: 'delete_task',
            title: `删除待办任务：「${taskTitleOrId}」`,
            status: 'running',
          };
          tail.steps.push(step);
          await scrollToBottom();

          const matchRes = findMatchingTasks(props.todos, taskTitleOrId);
          if (matchRes.ambiguous && matchRes.candidates) {
            const listDesc = matchRes.candidates
              .map((t) => `「${t.title}」(分类: ${t.category || '默认'}, ${t.completed ? '已完成' : '待办'})`)
              .join('、');
            step.status = 'error';
            step.title = `删除未执行：匹配到 ${matchRes.candidates.length} 个相似任务需确认`;
            await scrollToBottom();

            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: false,
                ambiguous: true,
                candidates: matchRes.candidates.map(formatTodoDetail),
                message: `未执行删除：检索到多条相似任务（${listDesc}）。为防止误删，请向用户列出这些选项并询问用户具体要删除哪一项。`,
              }),
            });
          } else if (matchRes.match) {
            const target = matchRes.match;
            emit('delete-task', target.id);
            step.status = 'done';
            step.title = `已删除待办任务：「${target.title}」`;
            await scrollToBottom();

            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: true,
                message: `待办任务「${target.title}」已从 Todolist 中删除！（支持撤销恢复）`,
              }),
            });
          } else {
            step.status = 'error';
            step.title = `未找到待删除任务：「${taskTitleOrId}」`;
            await scrollToBottom();
            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: false,
                error: `未在待办列表中找到任务「${taskTitleOrId}」，当前已有任务：${props.todos.map((t) => t.title).join('、') || '暂无'}`,
              }),
            });
          }
        } else if (toolName === 'clear_completed_tasks') {
          const step: AgentStep = {
            name: 'clear_completed_tasks',
            title: `清空所有已完成任务`,
            status: 'running',
          };
          tail.steps.push(step);
          await scrollToBottom();

          const completedCount = props.todos.filter((t) => t.completed).length;
          emit('clear-completed-tasks');
          step.status = 'done';
          step.title = `已清空 ${completedCount} 项已完成任务`;
          await scrollToBottom();

          conversation.push({
            role: 'tool',
            tool_call_id: call.id,
            name: toolName,
            content: JSON.stringify({
              success: true,
              clearedCount: completedCount,
              message: `已成功清空所有已完成任务（共 ${completedCount} 项，支持撤销恢复）！`,
            }),
          });
        } else if (toolName === 'restore_last_deleted') {
          const step: AgentStep = {
            name: 'restore_last_deleted',
            title: '撤销上一次删除操作',
            status: 'running',
          };
          tail.steps.push(step);
          await scrollToBottom();

          let restoreRes: { count: number; titles: string[] } = { count: 0, titles: [] };
          emit('restore-last-deleted', (res) => {
            if (res) restoreRes = res;
          });

          if (restoreRes.count > 0) {
            step.status = 'done';
            step.title = `已恢复 ${restoreRes.count} 项误删任务：${restoreRes.titles.join('、')}`;
            await scrollToBottom();

            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: true,
                restoredCount: restoreRes.count,
                restoredTitles: restoreRes.titles,
                message: `已成功撤销删除，恢复了 ${restoreRes.count} 条任务：${restoreRes.titles.map((x) => `「${x}」`).join('、')}！`,
              }),
            });
          } else {
            step.status = 'error';
            step.title = '最近删除记录为空，未恢复任何任务';
            await scrollToBottom();

            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                success: false,
                error: '最近删除记录为空，没有找到可撤销或恢复的任务。',
              }),
            });
          }
        } else if (toolName === 'query_tasks') {
          const dateRange = args.dateRange || 'all';
          const status = (args.status || 'all').toLowerCase();
          const category = (args.category || '').trim();
          const keyword = (args.keyword || '').trim().toLowerCase();
          const priority = args.priority !== undefined ? Number(args.priority) : undefined;
          const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(Math.floor(args.limit), 50) : 30;

          const step: AgentStep = {
            name: 'query_tasks',
            title: `查询任务列表（${dateRange !== 'all' ? dateRange : ''} ${status !== 'all' ? status : ''} ${category ? category : ''}）`.trim(),
            status: 'running',
          };
          tail.steps.push(step);
          await scrollToBottom();

          const filtered = props.todos.filter((t) => {
            if (status === 'pending' && t.completed) return false;
            if (status === 'completed' && !t.completed) return false;
            if (category && (t.category || '').toLowerCase() !== category.toLowerCase()) return false;
            if (priority !== undefined && t.priority !== priority) return false;
            if (keyword && !t.title.toLowerCase().includes(keyword)) return false;
            if (!matchesDateRange(t, dateRange)) return false;
            return true;
          });

          const totalMatched = filtered.length;
          const paged = filtered.slice(0, limit);

          step.status = 'done';
          step.title = `已检索到 ${totalMatched} 项符合条件的任务${totalMatched > limit ? `（展示前 ${limit} 项）` : ''}`;
          await scrollToBottom();

          conversation.push({
            role: 'tool',
            tool_call_id: call.id,
            name: toolName,
            content: JSON.stringify({
              totalMatched,
              returnedCount: paged.length,
              hasMore: totalMatched > limit,
              tasks: paged.map(formatTodoDetail),
            }),
          });
        } else if (toolName === 'web_search') {
          const query = (args.query || '').trim();
          const step: AgentStep = {
            name: 'web_search',
            title: `网络检索：${query || '实时信息'}`,
            status: 'running',
          };
          tail.steps.push(step);
          await scrollToBottom();

          const searchKey = searchEngine.value === 'bocha'
            ? bochaApiKey.value
            : searchEngine.value === 'tavily'
              ? tavilyApiKey.value
              : '';

          const results = await search(query, {
            engine: searchEngine.value,
            api_key: searchKey,
          });

          if (!tail.sources) tail.sources = [];
          for (const r of results) {
            if (!tail.sources.some((x) => x.link === r.link)) {
              tail.sources.push(r);
            }
          }
          step.status = 'done';
          step.title = `网络检索完成：已获取 ${results.length} 条相关资讯`;
          await scrollToBottom();

          conversation.push({
            role: 'tool',
            tool_call_id: call.id,
            name: toolName,
            content: JSON.stringify(
              results.map((r, i) => ({
                index: i + 1,
                title: r.title,
                link: r.link,
                snippet: r.snippet,
                source: r.source,
              })),
            ),
          });
        } else if (toolName === 'fetch_webpage') {
          const url = (args.url || '').trim();
          const step: AgentStep = {
            name: 'fetch_webpage',
            title: `深入阅读网页：${url}`,
            status: 'running',
          };
          tail.steps.push(step);
          await scrollToBottom();

          const text = await fetchWebpage(url);
          step.status = 'done';
          step.title = `网页阅读完成 (${text.length} 字)`;
          await scrollToBottom();

          conversation.push({
            role: 'tool',
            tool_call_id: call.id,
            name: toolName,
            content: text || '（未能获取网页文本内容）',
          });
        } else if (toolName === 'get_today_tasks') {
          const step: AgentStep = {
            name: 'get_today_tasks',
            title: `查询 Todolist 今日任务详情与进度`,
            status: 'running',
          };
          tail.steps.push(step);
          await scrollToBottom();

          const st = assistant.stats.value;
          const tasksInfo = {
            total: st.todayTasks.length,
            completedCount: st.completedToday.length,
            pendingCount: st.pendingToday.length,
            completionRate: `${st.completionRate}%`,
            pendingTasks: st.pendingToday.map(formatTodoDetail),
            completedTasks: st.completedToday.map(formatTodoDetail),
          };
          step.status = 'done';
          step.title = `已获取今日待办：共 ${st.todayTasks.length} 项（未完成 ${st.pendingToday.length} 项，完成率 ${st.completionRate}%）`;
          await scrollToBottom();

          conversation.push({
            role: 'tool',
            tool_call_id: call.id,
            name: toolName,
            content: JSON.stringify(tasksInfo),
          });
        } else {
          conversation.push({
            role: 'tool',
            tool_call_id: call.id,
            name: toolName,
            content: JSON.stringify({ error: `未知的工具: ${toolName}` }),
          });
        }
      }
    }

    // 2. 最终总结阶段：携带所有已收集的工具结果，强制模型直接给出最终回答，不再调用工具
    conversation.push({
      role: 'user',
      content: '请依据上文已经执行完成的工具调用结果，直接为当前问题给出清晰完整的最终回答。注意排版要求：务必使用规范优雅的 Markdown 格式，分段空行，使用加粗小节标题（如 **一、...**）、有序列表（1. 2.）或项目符号（- ），并在段落与列表之间空行分隔，严禁输出未经分段的密集文字墙。直接输出正文即可。',
    });

    const finalResult = await sendChat({
      endpoint: cfg.endpoint,
      apiKey: cfg.apiKey,
      model: cfg.model,
      messages: conversation,
      tools: undefined,
      stream,
      signal: ctrl.signal,
      onChunk: (chunk) => {
        tail.content += chunk;
        scrollToBottom();
      },
    });

    if (!stream && finalResult.content) tail.content = finalResult.content;
    if (cleanDSMLTags(tail.content) === '') {
      tail.content =
        finalResult.content ||
        '（模型已完成上述工具调用，但未返回可显示的文本总结。可再追问一次，或把需求说得更具体。）';
    }
    tail.content = cleanDSMLTags(tail.content);
    await scrollToBottom();
    return true;
  } catch (err: any) {
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
  messages.value.push({ id: nextMessageId(), role: 'user', content: text });
  refreshConversationTitle();
  const tail: LocalMsg = { id: nextMessageId(), role: 'assistant', content: '', sources: [], steps: [] };
  messages.value.push(tail);
  await scrollToBottom();

  if (apiKey.value.trim()) {
    await streamInto(tail);
  } else {
    tail.content = '（尚未配置 API Key，请先点击左下角 ⚙️「设置」完成模型配置后即可与我对话；通用问答需要模型支持。）';
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

// ---------- Per-message copy ----------
// Id of the message whose copy check-mark is currently shown.
const copiedMsgId = ref<number | null>(null);

const copyMessage = async (msg: LocalMsg) => {
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

// ---------- Conversation history ----------
const historyOpen = ref(false);

const startNewConversation = () => {
  if (isWaiting.value) return;
  conversations.newConversation();
  historyOpen.value = false;
  nextTick(() => scrollToBottom());
};

const switchConversation = (id: string) => {
  if (isWaiting.value) return;
  conversations.selectConversation(id);
  historyOpen.value = false;
  nextTick(() => scrollToBottom());
};

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
    <!-- Toolbar -->
    <div class="chat-toolbar">
      <div class="toolbar-actions" style="margin-left: auto;">
        <!-- Conversation history -->
        <div class="hist-wrap">
          <button
            class="tool-btn icon"
            :class="{ active: historyOpen }"
            title="历史记录"
            :disabled="isWaiting"
            @click="historyOpen = !historyOpen"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline><polyline points="12 7 12 12 15 15"></polyline></svg>
          </button>

          <div v-if="historyOpen" class="hist-panel">
            <div class="hist-head">
              <span>最近</span>
              <button
                type="button"
                class="hist-new"
                :disabled="isWaiting"
                @click="startNewConversation"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                <span>新聊天</span>
              </button>
            </div>
            <div class="hist-list">
              <div
                v-for="c in conversations.conversationsMeta.value"
                :key="c.id"
                class="hist-item"
                :class="{ active: c.id === conversations.activeId.value }"
                :title="c.label"
                @click="switchConversation(c.id)"
              >
                <span class="hist-item-title">{{ c.label }}</span>
                <span v-if="c.timeText" class="hist-item-time">{{ c.timeText }}</span>
                <button
                  type="button"
                  class="hist-item-delete"
                  title="删除会话"
                  @click.stop="conversations.deleteConversation(c.id)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

      <!-- Conversation -->
      <div ref="scroller" class="chat-scroll">
        <div class="chat-messages">
          <div v-for="msg in messages" :key="msg.id" class="msg-row" :class="msg.role">
            <div class="avatar" :class="msg.role">
              <!-- 精致现代 Bot 机器人头像 -->
              <svg v-if="msg.role === 'assistant'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 8V4H8"></path>
                <rect width="16" height="12" x="4" y="8" rx="2"></rect>
                <path d="M2 14h2"></path>
                <path d="M20 14h2"></path>
                <path d="M15 13v2"></path>
                <path d="M9 13v2"></path>
              </svg>
              <!-- 优雅现代 User 用户头像 -->
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <div class="bubble" :class="msg.role">
              <template v-if="msg.role === 'assistant'">
                <!-- Antigravity Agent steps trail -->
                <div v-if="msg.steps && msg.steps.length > 0" class="agent-steps">
                  <div v-for="(st, sIdx) in msg.steps" :key="sIdx" class="agent-step-item" :class="st.status">
                    <span v-if="st.status === 'running'" class="agent-step-spinner"></span>
                    <svg v-else-if="st.status === 'done'" class="agent-step-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <svg v-else class="agent-step-err" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    <span class="agent-step-title">{{ st.title }}</span>
                  </div>
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
                  v-if="isWaiting && msg.id === currentTypingMsg && msg.content === '' && (!msg.steps || !msg.steps.some((s) => s.status === 'running'))"
                  class="typing"
                >
                  <i></i><i></i><i></i>
                </span>
                <button
                  v-if="(msg.content || '').trim() !== ''"
                  class="copy-msg-btn"
                  :class="{ copied: copiedMsgId === msg.id }"
                  :title="copiedMsgId === msg.id ? '已复制' : '复制'"
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
                  <div class="model-dropdown-divider"></div>
                  <div
                    class="model-option model-option-settings"
                    title="前往设置配置模型"
                    @click="modelPickerOpen = false; emit('open-settings', 'ai')"
                  >
                    <div class="model-option-head">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                      <span class="model-option-name">配置模型...</span>
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
              <span class="stop-inner-square"></span>
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
  justify-content: flex-end;
  gap: 12px;
  padding-bottom: 6px;
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
.tool-btn:hover:not(:disabled) { color: var(--primary-color); border-color: var(--primary-color); }
.tool-btn:disabled { opacity: .6; cursor: not-allowed; }
.tool-btn.icon { padding: 6px; }
.toolbar-actions { display: flex; gap: 6px; }

/* Conversation history popover */
.hist-wrap { position: relative; }
.hist-wrap .tool-btn.active {
  color: var(--primary-color);
  border-color: var(--primary-color);
  background: var(--primary-light);
}
.hist-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 50;
  width: 290px;
  max-height: 340px;
  display: flex;
  flex-direction: column;
  padding: 6px;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, .16);
}
.hist-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}
.hist-new {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: var(--primary-color);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 3px 7px;
  border-radius: 6px;
  transition: all .15s ease;
}
.hist-new:hover {
  background: var(--primary-light);
}
.hist-new svg {
  flex-shrink: 0;
}
.hist-new:disabled { opacity: .5; cursor: not-allowed; }
.hist-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hist-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 12.5px;
  color: var(--text-main);
  cursor: pointer;
  overflow: hidden;
  transition: all .15s ease;
}
.hist-item:hover { background: var(--primary-light); }
.hist-item.active {
  background: color-mix(in srgb, var(--primary-color) 14%, transparent);
  font-weight: 600;
}
.hist-item-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hist-item-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 400;
}
.hist-item.active .hist-item-time {
  color: var(--primary-color);
  opacity: 0.9;
}
.hist-item-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--primary-color);
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.75;
  transition: all .15s ease;
}
.hist-item:hover .hist-item-delete {
  opacity: 1;
}
.hist-item-delete:hover {
  background: var(--primary-light);
  color: var(--primary-color);
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

/* markdown body - Full GFM Support */
.md-content {
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--text-main);
  word-break: break-word;
}
.md-content :deep(p) {
  margin: 0 0 10px 0;
  line-height: 1.7;
}
.md-content :deep(p:last-child) {
  margin-bottom: 0;
}
.md-content :deep(h1),
.md-content :deep(h2),
.md-content :deep(h3),
.md-content :deep(h4),
.md-content :deep(h5),
.md-content :deep(h6) {
  font-weight: 600;
  color: var(--text-main);
  margin: 16px 0 8px;
  line-height: 1.4;
}
.md-content :deep(h1) { font-size: 17px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
.md-content :deep(h2) { font-size: 15.5px; }
.md-content :deep(h3) { font-size: 14.5px; }
.md-content :deep(h4) { font-size: 13.8px; }

/* Lists: Ordered & Unordered */
.md-content :deep(ul),
.md-content :deep(ol) {
  margin: 6px 0 12px 0;
  padding-left: 20px;
}
.md-content :deep(li) {
  margin: 4px 0;
  line-height: 1.65;
}
.md-content :deep(li > p) {
  margin: 0;
}
.md-content :deep(ul > li) {
  list-style-type: disc;
}
.md-content :deep(ol > li) {
  list-style-type: decimal;
}
.md-content :deep(li::marker) {
  color: var(--primary-color);
  font-weight: 600;
}

/* GFM Tables */
.md-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 13px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}
.md-content :deep(th),
.md-content :deep(td) {
  border: 1px solid var(--border-color);
  padding: 8px 12px;
  text-align: left;
}
.md-content :deep(th) {
  background: color-mix(in srgb, var(--primary-color) 10%, var(--bg-sidebar));
  font-weight: 600;
  color: var(--text-main);
}
.md-content :deep(tr:nth-child(even)) {
  background: color-mix(in srgb, var(--text-main) 3%, transparent);
}
.md-content :deep(tr:hover) {
  background: color-mix(in srgb, var(--primary-color) 4%, transparent);
}

/* Blockquotes */
.md-content :deep(blockquote) {
  margin: 10px 0;
  padding: 6px 14px;
  border-left: 3px solid var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 6%, var(--bg-sidebar));
  border-radius: 0 6px 6px 0;
  color: var(--text-secondary);
}
.md-content :deep(blockquote p) {
  margin: 0;
}

/* Code & Pre */
.md-content :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: color-mix(in srgb, var(--text-muted) 15%, transparent);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}
.md-content :deep(pre) {
  background: color-mix(in srgb, var(--text-main) 6%, var(--bg-main));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 14px;
  overflow: auto;
  margin: 10px 0;
}
.md-content :deep(pre code) {
  background: transparent;
  padding: 0;
  border-radius: 0;
  font-size: 12.5px;
}

/* Links & Text */
.md-content :deep(a) {
  color: var(--primary-color);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.md-content :deep(strong) {
  font-weight: 600;
  color: var(--text-main);
}
.md-content :deep(hr) {
  border: none;
  border-top: 1px dashed var(--border-color);
  margin: 14px 0;
}

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
.send-circle.stop {
  background: color-mix(in srgb, var(--text-main) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent);
}
.send-circle.stop:hover {
  background: color-mix(in srgb, var(--text-main) 18%, transparent);
  filter: none;
}
.stop-inner-square {
  width: 12px;
  height: 12px;
  background-color: var(--primary-color);
  border-radius: 2.5px;
  display: block;
  transition: transform 0.15s ease, background-color 0.2s ease;
}
.send-circle.stop:hover .stop-inner-square {
  transform: scale(0.92);
}

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

.model-dropdown-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}
.model-option-settings {
  color: var(--primary-color);
}
.model-option-settings .model-option-name {
  font-size: 13px;
  font-weight: 500;
}


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

/* Antigravity Agent Execution Steps */
.agent-steps {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 8px;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--primary-color) 7%, var(--bg-main));
  border: 1px solid color-mix(in srgb, var(--primary-color) 18%, transparent);
  border-radius: 8px;
  font-size: 12px;
}
.agent-step-item {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-secondary);
}
.agent-step-item.running {
  color: var(--primary-color);
  font-weight: 500;
}
.agent-step-item.done {
  color: var(--text-secondary);
}
.agent-step-spinner {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  border: 2px solid color-mix(in srgb, var(--primary-color) 25%, transparent);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.agent-step-check {
  flex-shrink: 0;
  color: var(--success-color, #16a34a);
}
.agent-step-err {
  flex-shrink: 0;
  color: var(--danger-color, #ef4444);
}
.agent-step-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
