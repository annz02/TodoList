<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import type { Todo } from './types';
import { useTheme } from './composables/useTheme';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

// Import components
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

const playBeep = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      const startTime = ctx.currentTime + i * 0.12;
      
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.1, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
      
      osc.start(startTime);
      osc.stop(startTime + 0.4);
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1000);
  } catch (e) {
    console.warn('Audio play failed', e);
  }
};

onMounted(async () => {
  loadTodos();
  initTheme();
  getCurrentWindow().maximize();

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

  // Notification checker & Time syncer
  checkInterval = window.setInterval(async () => {
    syncCurrentTime();
    const now = nowRef.value.getTime();
    let hasUpdates = false;
    
    // Check system notification permission
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }
    
    todos.value.forEach(task => {
      if (!task.completed && task.notify && task.dueDate) {
        const dueTime = new Date(task.dueDate).getTime();
        const diffMinutes = (dueTime - now) / (1000 * 60);
        
        let triggerMins = 15;
        if (task.reminderOption === '30 分钟前') triggerMins = 30;
        else if (task.reminderOption === '1 小时前') triggerMins = 60;
        
        let shouldNotify = false;
        
        // Initial notification
        if (!task.notified && diffMinutes <= triggerMins && diffMinutes > -5) {
          shouldNotify = true;
        } 
        // Repeating notification
        else if (task.notified && task.repeatOption && task.repeatOption !== '不重复' && task.lastNotifiedTime) {
          const repeatMins = task.repeatOption === '每十分钟' ? 10 : 5;
          const minsSinceLastNotify = (now - task.lastNotifiedTime) / (1000 * 60);
          if (minsSinceLastNotify >= repeatMins) {
            shouldNotify = true;
          }
        }
        
        if (shouldNotify) {
          const minsStr = Math.max(0, Math.round(diffMinutes));
          const msg = diffMinutes <= 0 ? `「${task.title}」已经到期啦！` : `「${task.title}」还有不到 ${minsStr} 分钟就要到期啦！`;
          
          // 1. Sound
          playBeep();
          
          // 2. System Desktop Notification
          if (permissionGranted) {
            sendNotification({ title: 'Todolist 任务临期提醒', body: msg, sound: 'default' });
          }
          
          task.notified = true;
          task.lastNotifiedTime = now;
          hasUpdates = true;
        }
      }
    });
    
    if (hasUpdates) {
      saveTodos();
    }
  }, 5000);
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

const minimizeWindow = () => getCurrentWindow().minimize();
const toggleMaximize = () => getCurrentWindow().toggleMaximize();
const closeWindow = () => getCurrentWindow().close();
</script>

<template>
  <Sidebar 
    v-model:activeCategory="activeCategory"
    :todayCount="todayCount"
    :completedCount="completedCount"
    :allCount="allCount"
    @add-task-clicked="() => handleAddTaskClick()"
    @open-settings="showSettingsModal = true"
  />

  <!-- Main Content -->
  <main class="main-content" style="position: relative;">
    <div data-tauri-drag-region style="position: absolute; top: 0; left: 0; right: 0; height: 64px; z-index: 10;"></div>
    <div class="window-controls" style="z-index: 10000;">
      <button @click="minimizeWindow" class="win-btn" title="最小化">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
      <button @click="toggleMaximize" class="win-btn" title="最大化">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect></svg>
      </button>
      <button @click="closeWindow" class="win-btn close-win-btn" title="关闭">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    <header class="header">
      <div class="header-left" data-tauri-drag-region style="flex-grow: 1; z-index: 10;">
        <div style="pointer-events: none;">
          <h1>
            {{ activeCategory === 'today' ? '今天' : activeCategory === 'completed' ? '已完成' : activeCategory === 'calendar' ? '日历视图' : activeCategory === 'ai-chat' ? 'AI 助手' : '全部任务' }}
          </h1>
          <div class="date" v-if="headerSubTitle">{{ headerSubTitle }}</div>
        </div>
      </div>
      <div class="header-right" style="z-index: 11;" v-if="activeCategory !== 'ai-chat'">
        <div class="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" placeholder="搜索任务..." v-model="searchQuery">
        </div>
        <button class="new-task-btn" @click="() => handleAddTaskClick()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          新建任务
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
      <AIChatView :todos="todos" />
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
            <span class="group-title">新建任务</span>
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

  <SettingsModal :show="showSettingsModal" @close="showSettingsModal = false" />

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
/* AI 助手页包装容器：占据 header 之下、主区内的剩余高度 */
.ai-chat-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 0.5rem;
}
</style>
