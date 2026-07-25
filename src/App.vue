<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Todo } from './types';
import { useTheme } from './composables/useTheme';
import { useToast } from './composables/useToast';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

// Import components
import Sidebar from './components/Sidebar.vue';
import SettingsModal from './components/SettingsModal.vue';
import TaskItem from './components/TaskItem.vue';
import InlineTaskCard from './components/InlineTaskCard.vue';
import Toast from './components/Toast.vue';
const { initTheme } = useTheme();
const { showToast } = useToast();

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
      { id: '1', title: '完成项目需求文档', completed: false, startTime: '2024-05-20T09:00', dueDate: '2024-05-25T18:00', timeText: '2024-05-20 09:00 - 2024-05-25 18:00' },
      { id: '2', title: 'Vue组件开发', completed: true, startTime: '2024-05-20T14:00', dueDate: '2024-05-20T17:00', timeText: '14:00 - 17:00' },
      { id: '3', title: '学习 Rust', completed: false, startTime: '2024-05-20T20:00', dueDate: '2024-05-20T22:00', timeText: '20:00 - 22:00' },
      { id: '4', title: '去健身房', completed: false, startTime: '2024-05-21T19:00', dueDate: '2024-05-21T20:30', timeText: '明天 19:00' },
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
  } catch (e) {
    console.warn('Audio play failed', e);
  }
};

onMounted(() => {
  loadTodos();
  initTheme();

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
          
          // 1. In-app Toast and Sound
          showToast(msg);
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
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  if (checkInterval) clearInterval(checkInterval);
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
  const primaryDateStr = startDateStr || dueDateStr;

  if (primaryDateStr) {
    // 1. 开始时间/结束时间等于今天：属于今天（无论是未完成还是今天完成的，今天都保留展示在“今天”列表中）
    if (primaryDateStr === todayStr) {
      return true;
    }
    // 2. 开始时间属于未来（晚于今天）：尚在未来，不出现在“今天”菜单
    if (primaryDateStr > todayStr) {
      return false;
    }
    // 3. 开始时间属于过去（早于今天）：到了第二天及以后，已完成任务自动移出，未完成任务自动流动并继续在“今天”展示
    if (primaryDateStr < todayStr) {
      return !t.completed;
    }
  }

  // 没有设定具体日期的任务：
  if (t.completed) {
    // 如果是今天完成的无日期任务，今天保留在“今天”列表，第二天（completedAt < todayStr）自动移出
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
  todos.value = todos.value.filter(t => t.id !== id);
  saveTodos();
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

const todayCount = computed(() => todos.value.filter(t => isTodayTask(t)).length);
const completedCount = computed(() => todos.value.filter(t => t.completed).length);
const allCount = computed(() => todos.value.length);

const currentDate = computed(() => nowRef.value.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }));

const handleAddTaskClick = () => {
  showInlineCreate.value = true;
};

const handleInlineSave = (data: { title: string; startTime: string; dueDate: string }) => {
  const newTask: Todo = {
    id: Date.now().toString(),
    title: data.title,
    completed: false,
    startTime: data.startTime || undefined,
    dueDate: data.dueDate || undefined,
    timeText: formatTimeText(data.dueDate, data.startTime),
  };
  todos.value.push(newTask);
  saveTodos();
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
    @add-task-clicked="handleAddTaskClick"
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
            {{ activeCategory === 'today' ? '今天' : activeCategory === 'completed' ? '已完成' : '全部任务' }}
          </h1>
          <div class="date">{{ currentDate }}</div>
        </div>
      </div>
      <div class="header-right" style="z-index: 11;">
        <div class="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" placeholder="搜索任务..." v-model="searchQuery">
        </div>
        <button class="new-task-btn" @click="handleAddTaskClick">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          新建任务
        </button>
      </div>
    </header>

    <div class="task-list">
      <TransitionGroup name="list">
        <TaskItem 
          v-for="task in filteredTodos" 
          :key="task.id" 
          :task="task" 
          @toggle="toggleComplete" 
          @delete="deleteTask" 
          @update-task="handleUpdateTask"
        />
      </TransitionGroup>
      
      <InlineTaskCard 
        v-if="showInlineCreate" 
        @save="handleInlineSave" 
        @cancel="showInlineCreate = false" 
      />

      <div v-if="filteredTodos.length === 0 && !showInlineCreate" class="no-more">
        没有更多任务了
      </div>
    </div>
  </main>

  <SettingsModal :show="showSettingsModal" @close="showSettingsModal = false" />
  <Toast />
</template>
