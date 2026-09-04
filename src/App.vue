<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Todo } from './types';
import { useTheme } from './composables/useTheme';
import TitleBar from './components/TitleBar.vue';
import Sidebar from './components/Sidebar.vue';
import SettingsModal from './components/SettingsModal.vue';
import TaskItem from './components/TaskItem.vue';
import InlineTaskCard from './components/InlineTaskCard.vue';
import CalendarView from './components/CalendarView.vue';
import AIChatView from './components/AIChatView.vue';
import UpdateModal from './components/UpdateModal.vue';
import ChangelogModal from './components/ChangelogModal.vue';
import { useUpdate } from './composables/useUpdate';

const { initTheme } = useTheme();
const { currentVersion, autoCheckUpdate, checkUpdate, pendingUpdate, installUpdate, applyUpdateState, refreshUpdateState, updateBusy, progressPercent } = useUpdate();

const showStartupUpdateModal = ref(false);
const showChangelogModal = ref(false);
let unlistenUpdate: (() => void) | null = null;

const todos = ref<Todo[]>([]);
const nowRef = ref(new Date());
const showInlineCreate = ref(false);
const searchQuery = ref('');
const activeCategory = ref('today');
const showSettingsModal = ref(false);
const settingsModalTab = ref<'general' | 'ai' | 'shortcuts'>('general');

const handleOpenSettings = (tab: 'general' | 'ai' | 'shortcuts' = 'general') => {
  settingsModalTab.value = tab;
  showSettingsModal.value = true;
};
let checkInterval: number;

const syncCurrentTime = () => {
  nowRef.value = new Date();
  updateTimeTexts();
};

// Load from Rust backend
const loadTodos = async () => {
  try {
    const data: string = await invoke('load_todos');
    todos.value = JSON.parse(data);
  } catch (e) {
    console.error('Failed to load todos:', e);
    // Dummy data for testing if no rust backend available
    todos.value = [
      { id: '1', title: '完成项目需求文档', category: '工作', completed: false, startTime: '2024-05-20T09:00', dueDate: '2024-05-25T18:00', timeText: '2024-05-20 09:00 - 2024-05-25 18:00' },
      { id: '2', title: 'Vue组件开发', category: '开发', completed: true, startTime: '2024-05-20T14:00', dueDate: '2024-05-20T17:00', timeText: '14:00 - 17:00' },
      { id: '3', title: '学习 Rust', category: '学习', completed: false, startTime: '2024-05-20T20:00', dueDate: '2024-05-20T22:00', timeText: '20:00 - 22:00' },
      { id: '4', title: '去健身房', category: '生活', completed: false, startTime: '2024-05-21T19:00', dueDate: '2024-05-21T20:30', timeText: '明天 19:00' },
    ];
  }
  updateTimeTexts();
};

// Save to Rust backend
const saveTodos = async () => {
  try {
    await invoke('save_todos', { data: JSON.stringify(todos.value) });
  } catch (e) {
    console.error('Failed to save todos:', e);
  }
};

onMounted(async () => {
  loadTodos();
  initTheme();

  // Startup auto check for updates if enabled
  if (autoCheckUpdate.value) {
    setTimeout(async () => {
      const update = await checkUpdate(false);
      if (update) {
        showStartupUpdateModal.value = true;
      }
    }, 1500);
  }

  // Register update-status event listener for real-time progress
  try {
    await refreshUpdateState();
    unlistenUpdate = await listen('update-status', (event: any) => {
      if (event?.payload) {
        applyUpdateState(event.payload);
      }
    });
  } catch (e) {
    console.warn('Failed to setup update listener:', e);
  }

  window.addEventListener('focus', syncCurrentTime);
  document.addEventListener('visibilitychange', syncCurrentTime);

  // Time syncer
  checkInterval = window.setInterval(() => {
    syncCurrentTime();
  }, 10000);
});

const selectedTaskId = ref<string | null>(null);

const handleGlobalKeydown = (e: KeyboardEvent) => {
  const isCtrlOrCmd = e.ctrlKey || e.metaKey;
  if (!isCtrlOrCmd) return;

  const key = e.key.toLowerCase();
  
  if (key === 'n') {
    e.preventDefault();
    handleAddTaskClick();
  } else if (key === 's') {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('app-save-shortcut'));
  } else if (key === 'e') {
    e.preventDefault();
    if (selectedTaskId.value) {
      window.dispatchEvent(new CustomEvent('app-edit-shortcut'));
    }
  } else if (key === 'd') {
    e.preventDefault();
    if (selectedTaskId.value) {
      deleteTask(selectedTaskId.value);
    }
  } else if (key === 'w') {
    e.preventDefault();
    if (showInlineCreate.value) {
      showInlineCreate.value = false;
    }
    window.dispatchEvent(new CustomEvent('app-cancel-shortcut'));
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  if (checkInterval) clearInterval(checkInterval);
  if (unlistenUpdate) unlistenUpdate();
  window.removeEventListener('focus', syncCurrentTime);
  document.removeEventListener('visibilitychange', syncCurrentTime);
  window.removeEventListener('keydown', handleGlobalKeydown);
});

const formatSingleTime = (dateStr?: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = nowRef.value;
  
  const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.getDate() === tomorrow.getDate() && d.getMonth() === tomorrow.getMonth() && d.getFullYear() === tomorrow.getFullYear();
  
  const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  if (isToday) return `今天 ${timePart}`;
  if (isTomorrow) return `明天 ${timePart}`;
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${timePart}`;
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${timePart}`;
};

const formatTimeText = (dateStr?: string, startDateStr?: string) => {
  if (!dateStr && !startDateStr) return '';
  if (startDateStr && dateStr) {
    const s = formatSingleTime(startDateStr);
    const e = formatSingleTime(dateStr);
    return `${s} - ${e}`;
  }
  return formatSingleTime(dateStr || startDateStr);
};

const updateTimeTexts = () => {
  let changed = false;
  todos.value.forEach(task => {
    if (task.dueDate || task.startTime) {
      const newText = formatTimeText(task.dueDate, task.startTime);
      if (task.timeText !== newText) {
        task.timeText = newText;
        changed = true;
      }
    }
  });
  if (changed) {
    saveTodos();
  }
};

const getYYYYMMDD = (dateInput?: string | Date) => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const isTodayTask = (t: Todo) => {
  const todayStr = getYYYYMMDD(nowRef.value);
  const startDateStr = getYYYYMMDD(t.startTime);
  const dueDateStr = getYYYYMMDD(t.dueDate);

  if (startDateStr && dueDateStr && startDateStr <= dueDateStr) {
    if (todayStr >= startDateStr && todayStr <= dueDateStr) {
      return true;
    }
    if (todayStr > dueDateStr) {
      return !t.completed;
    }
    return false;
  }

  const primaryDateStr = startDateStr || dueDateStr;

  if (primaryDateStr) {
    if (primaryDateStr === todayStr) {
      return true;
    }
    if (primaryDateStr > todayStr) {
      return false;
    }
    if (primaryDateStr < todayStr) {
      return !t.completed;
    }
  }

  if (t.completed) {
    const completedDateStr = getYYYYMMDD(t.completedAt);
    if (completedDateStr) {
      return completedDateStr === todayStr;
    }
  }

  return true;
};

const toggleComplete = (task: Todo) => {
  task.completed = !task.completed;
  if (task.completed) {
    task.completedAt = getYYYYMMDD(nowRef.value);
  } else {
    delete task.completedAt;
  }
  saveTodos();
};

const deleteTask = (id: string) => {
  const index = filteredTodos.value.findIndex(t => t.id === id);
  todos.value = todos.value.filter(t => t.id !== id);
  saveTodos();

  if (selectedTaskId.value === id) {
    const remaining = filteredTodos.value;
    if (remaining.length > 0) {
      const nextIndex = Math.min(index, remaining.length - 1);
      selectedTaskId.value = remaining[nextIndex].id;
    } else {
      selectedTaskId.value = null;
    }
  }
};

const handleUpdateTask = (updatedTask: Todo) => {
  const index = todos.value.findIndex(t => t.id === updatedTask.id);
  if (index !== -1) {
    todos.value[index] = {
      ...updatedTask,
      timeText: formatTimeText(updatedTask.dueDate, updatedTask.startTime)
    };
    saveTodos();
  }
};

const filteredTodos = computed(() => {
  let result = todos.value;
  if (searchQuery.value) {
    result = result.filter(t => t.title.toLowerCase().includes(searchQuery.value.toLowerCase()));
  }
  
  if (activeCategory.value === 'today') {
    result = result.filter(t => isTodayTask(t));
  } else if (activeCategory.value === 'completed') {
    result = result.filter(t => t.completed);
  }
  
  return result;
});

const groupedTodos = computed(() => {
  const list = filteredTodos.value;
  if (list.length === 0) return [];

  const groupsMap = new Map<string, Todo[]>();
  
  list.forEach(task => {
    const cat = task.category?.trim() || '未分类';
    if (!groupsMap.has(cat)) {
      groupsMap.set(cat, []);
    }
    groupsMap.get(cat)!.push(task);
  });

  const result: { name: string; tasks: Todo[] }[] = [];
  const unclassifiedTasks = groupsMap.get('未分类');
  
  groupsMap.forEach((tasks, name) => {
    if (name !== '未分类') {
      result.push({ name, tasks });
    }
  });

  if (unclassifiedTasks && unclassifiedTasks.length > 0) {
    result.push({ name: '未分类', tasks: unclassifiedTasks });
  }

  return result;
});

const todayCount = computed(() => todos.value.filter(t => isTodayTask(t)).length);
const completedCount = computed(() => todos.value.filter(t => t.completed).length);
const allCount = computed(() => todos.value.length);

const currentDate = computed(() => nowRef.value.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }));

const headerSubTitle = computed(() => {
  if (activeCategory.value === 'all') {
    return '记录每一件事，轻松掌控工作与生活';
  }
  if (activeCategory.value === 'completed') {
    return '回顾成就，保持高效';
  }
  if (activeCategory.value === 'calendar') {
    return '点击日期查看当天任务，合理规划每一天';
  }
  if (activeCategory.value === 'ai-chat') {
    return '';
  }
  return currentDate.value;
});

const initialStartTime = ref<string | undefined>(undefined);

const handleAddTaskClick = (startTime?: string) => {
  if (activeCategory.value === 'completed') {
    activeCategory.value = 'all';
  }
  initialStartTime.value = typeof startTime === 'string' ? startTime : undefined;
  showInlineCreate.value = true;
};

watch(activeCategory, () => {
  showInlineCreate.value = false;
});


const handleInlineSave = (data: { title: string; category?: string; startTime: string; dueDate: string; gitUrl?: string }) => {
  const newTask: Todo = {
    id: Date.now().toString(),
    title: data.title,
    category: data.category || undefined,
    gitUrl: data.gitUrl || undefined,
    completed: false,
    startTime: data.startTime || undefined,
    dueDate: data.dueDate || undefined,
    timeText: formatTimeText(data.dueDate, data.startTime),
  };
  todos.value.push(newTask);
  saveTodos();
  selectedTaskId.value = newTask.id;
  showInlineCreate.value = false;
};

const getCurrentNowISO = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};



const normalizePriority = (p?: any): number | undefined => {
  if (p === undefined || p === null) return undefined;
  if (typeof p === 'number') return Math.min(3, Math.max(1, p));
  const s = String(p).trim();
  if (['3', '高', '紧急', 'high', 'p1'].includes(s)) return 3;
  if (['2', '中', '普通', 'medium', 'p2'].includes(s)) return 2;
  if (['1', '低', '不急', 'low', 'p3'].includes(s)) return 1;
  return undefined;
};

// 最近删除任务暂存区（用于安全撤销与恢复）
const recentlyDeletedStack = ref<Array<{ tasks: Todo[]; timestamp: number; desc: string }>>([]);

const handleCreateTaskFromAI = (data: {
  title: string;
  category?: string;
  dueDate?: string;
  startTime?: string;
  priority?: any;
}) => {
  const finalStartTime = (data.startTime || '').trim() || getCurrentNowISO();
  const newTask: Todo = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: data.title,
    category: data.category || '工作',
    completed: false,
    startTime: finalStartTime,
    dueDate: data.dueDate || undefined,
    timeText: formatTimeText(data.dueDate, finalStartTime),
    priority: normalizePriority(data.priority),
  };
  todos.value.push(newTask);
  saveTodos();
  return newTask;
};

const handleBatchCreateTasksFromAI = (
  tasks: Array<{
    title: string;
    category?: string;
    dueDate?: string;
    startTime?: string;
    priority?: any;
  }>
) => {
  const createdList: Todo[] = [];
  tasks.forEach((data, index) => {
    const finalStartTime = (data.startTime || '').trim() || getCurrentNowISO();
    const newTask: Todo = {
      id: `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
      title: data.title,
      category: data.category || '工作',
      completed: false,
      startTime: finalStartTime,
      dueDate: data.dueDate || undefined,
      timeText: formatTimeText(data.dueDate, finalStartTime),
      priority: normalizePriority(data.priority),
    };
    todos.value.push(newTask);
    createdList.push(newTask);
  });
  saveTodos();
  return createdList;
};

const normalizeTaskName = (s: string) => {
  return s
    .replace(/[「」【】“”"'\s\t`·]/g, '')
    .replace(/(任务|待办|事项)$/, '')
    .toLowerCase();
};

const findTaskIndexByAI = (query: string): number => {
  if (!query) return -1;
  const raw = query.trim();
  // 1. Direct ID match
  let idx = todos.value.findIndex((t) => t.id === raw);
  if (idx !== -1) return idx;

  const cleanQ = normalizeTaskName(raw);
  if (!cleanQ) return -1;

  // 2. Exact clean title match
  idx = todos.value.findIndex((t) => normalizeTaskName(t.title) === cleanQ);
  if (idx !== -1) return idx;

  // 3. Bidirectional inclusion match
  idx = todos.value.findIndex((t) => {
    const cleanT = normalizeTaskName(t.title);
    if (!cleanT) return false;
    return cleanT.includes(cleanQ) || cleanQ.includes(cleanT);
  });
  return idx;
};

const handleCompleteTaskFromAI = (titleOrId: string) => {
  const index = findTaskIndexByAI(titleOrId);
  if (index !== -1) {
    const t = todos.value[index];
    t.completed = true;
    t.completedAt = new Date().toISOString();
    saveTodos();
    return t;
  }
  return null;
};

const handleReopenTaskFromAI = (titleOrId: string) => {
  const index = findTaskIndexByAI(titleOrId);
  if (index !== -1) {
    const t = todos.value[index];
    t.completed = false;
    t.completedAt = undefined;
    saveTodos();
    return t;
  }
  return null;
};

const handleDeleteTaskFromAI = (titleOrId: string): Todo | null => {
  const index = findTaskIndexByAI(titleOrId);
  if (index !== -1) {
    const deleted = todos.value.splice(index, 1)[0];
    recentlyDeletedStack.value.push({
      tasks: [deleted],
      timestamp: Date.now(),
      desc: `删除任务「${deleted.title}」`,
    });
    if (recentlyDeletedStack.value.length > 20) {
      recentlyDeletedStack.value.shift();
    }
    saveTodos();
    return deleted;
  }
  return null;
};

const handleClearCompletedTasksFromAI = () => {
  const completedList = todos.value.filter((t) => t.completed);
  if (completedList.length > 0) {
    recentlyDeletedStack.value.push({
      tasks: [...completedList],
      timestamp: Date.now(),
      desc: `清空 ${completedList.length} 项已完成任务`,
    });
    if (recentlyDeletedStack.value.length > 20) {
      recentlyDeletedStack.value.shift();
    }
    todos.value = todos.value.filter((t) => !t.completed);
    saveTodos();
  }
  return completedList.length;
};

const handleRestoreLastDeletedFromAI = (): { count: number; titles: string[] } => {
  const last = recentlyDeletedStack.value.pop();
  if (!last || last.tasks.length === 0) {
    return { count: 0, titles: [] };
  }
  const restoredTitles: string[] = [];
  last.tasks.forEach((t) => {
    if (!todos.value.some((x) => x.id === t.id)) {
      todos.value.push(t);
      restoredTitles.push(t.title);
    }
  });
  saveTodos();
  return { count: restoredTitles.length, titles: restoredTitles };
};

const handleUpdateTaskFromAI = (data: {
  taskTitleOrId: string;
  newTitle?: string;
  newCategory?: string;
  newDueDate?: string;
  newStartTime?: string;
  newPriority?: any;
}): Todo | null => {
  const index = findTaskIndexByAI(data.taskTitleOrId);
  if (index !== -1) {
    const task = todos.value[index];
    if (data.newTitle) task.title = data.newTitle;
    if (data.newCategory) task.category = data.newCategory;
    if (data.newStartTime !== undefined) {
      task.startTime = data.newStartTime || undefined;
    }
    if (data.newDueDate !== undefined) {
      task.dueDate = data.newDueDate || undefined;
    }
    if (data.newStartTime !== undefined || data.newDueDate !== undefined) {
      task.timeText = formatTimeText(task.dueDate, task.startTime);
    }
    if (data.newPriority !== undefined) {
      task.priority = normalizePriority(data.newPriority);
    }
    saveTodos();
    return task;
  }
  return null;
};

</script>

<template>
  <div class="app-layout">
    <TitleBar title="Todolist" />
    <div class="app-body">
      <Sidebar 
        v-model:activeCategory="activeCategory"
        :todayCount="todayCount"
        :completedCount="completedCount"
        :allCount="allCount"
        @open-settings="handleOpenSettings('general')"
      />

      <!-- Main Content -->
      <main class="main-content">
        <header class="header" :class="{ 'ai-chat-mode': activeCategory === 'ai-chat' }">
          <div class="header-left">
            <div>
              <h1>
                {{ activeCategory === 'today' ? '今天' : activeCategory === 'completed' ? '已完成' : activeCategory === 'calendar' ? '日历视图' : activeCategory === 'ai-chat' ? 'AI 助手' : '全部任务' }}
              </h1>
              <div class="date" v-if="headerSubTitle">{{ headerSubTitle }}</div>
            </div>
          </div>
          <div class="header-right" v-if="activeCategory !== 'ai-chat'">
            <div class="search-box">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input type="text" placeholder="搜索任务..." v-model="searchQuery">
            </div>
            <button class="new-task-btn" @click="() => handleAddTaskClick()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              添加任务
            </button>
          </div>
        </header>

    <CalendarView 
      v-if="activeCategory === 'calendar'"
      :todos="todos"
      :selectedTaskId="selectedTaskId"
      :showInlineCreate="showInlineCreate"
      :initialStartTime="initialStartTime"
      @select="selectedTaskId = $event"
      @toggle="toggleComplete"
      @delete="deleteTask"
      @update-task="handleUpdateTask"
      @save-inline="handleInlineSave"
      @cancel-inline="showInlineCreate = false"
      @open-create="handleAddTaskClick"
      @switch-to-list="activeCategory = 'all'"
    />

    <div v-else-if="activeCategory === 'ai-chat'" class="ai-chat-page">
      <AIChatView
        :todos="todos"
        @create-task="handleCreateTaskFromAI"
        @batch-create-tasks="handleBatchCreateTasksFromAI"
        @complete-task="handleCompleteTaskFromAI"
        @reopen-task="handleReopenTaskFromAI"
        @delete-task="handleDeleteTaskFromAI"
        @clear-completed-tasks="handleClearCompletedTasksFromAI"
        @update-task="handleUpdateTaskFromAI"
        @restore-last-deleted="(cb) => { const res = handleRestoreLastDeletedFromAI(); if (cb) cb(res); }"
        @open-settings="(tab) => handleOpenSettings(tab || 'ai')"
      />
    </div>

    <div v-else class="task-list">
      <!-- Create Card Section when active -->
      <div v-if="showInlineCreate && activeCategory !== 'completed'" class="category-group-section create-section">
        <div class="category-group-header">
          <div class="header-tag">
            <svg class="header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span class="group-title">添加任务</span>
          </div>
          <div class="group-divider"></div>
        </div>
        <div class="category-task-grid">
          <InlineTaskCard 
            :initialStartTime="initialStartTime"
            @save="handleInlineSave" 
            @cancel="showInlineCreate = false" 
          />
        </div>
      </div>

      <!-- Grouped Category Sections -->
      <div 
        v-for="group in groupedTodos" 
        :key="group.name" 
        class="category-group-section"
      >
        <div class="category-group-header">
          <div class="header-tag">
            <svg class="header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
              <line x1="7" y1="7" x2="7.01" y2="7"></line>
            </svg>
            <span class="group-title">{{ group.name }}</span>
            <span class="group-count">{{ group.tasks.length }}</span>
          </div>
          <div class="group-divider"></div>
        </div>

        <div class="category-task-grid">
          <TransitionGroup name="list">
            <TaskItem 
              v-for="task in group.tasks" 
              :key="task.id" 
              :task="task" 
              :isSelected="task.id === selectedTaskId"
              @select="selectedTaskId = $event"
              @toggle="toggleComplete" 
              @delete="deleteTask" 
              @update-task="handleUpdateTask"
            />
          </TransitionGroup>
        </div>
      </div>

      <div v-if="filteredTodos.length === 0 && !showInlineCreate" class="no-more">
        没有更多任务了
      </div>
    </div>
  </main>
</div>
</div>

  <SettingsModal
    :show="showSettingsModal"
    :initial-tab="settingsModalTab"
    @close="showSettingsModal = false"
  />

  <!-- 启动自动检查更新弹窗 -->
  <UpdateModal
    :show="showStartupUpdateModal"
    :current-version="currentVersion"
    :update-info="pendingUpdate"
    :update-busy="updateBusy"
    :progress-percent="progressPercent"
    @close="showStartupUpdateModal = false"
    @view-changelog="showStartupUpdateModal = false; showChangelogModal = true"
    @install="installUpdate"
  />

  <ChangelogModal
    :show="showChangelogModal"
    @close="showChangelogModal = false"
  />
</template>

<style scoped>
/* AI 助手页顶栏紧凑排版，带有与输入框顶部一致的精致分割横线 */
.header.ai-chat-mode {
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border-color);
  align-items: center;
}

.header.ai-chat-mode .header-left h1 {
  margin-bottom: 0;
}

/* AI 助手页包装容器：紧凑承接标题，占据剩余全部视口高度 */
.ai-chat-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 0;
}
</style>
