<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { Todo } from './types';
import { useTheme } from './composables/useTheme';
import { useToast } from './composables/useToast';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

// Import components
import Sidebar from './components/Sidebar.vue';
import SettingsModal from './components/SettingsModal.vue';
import TaskItem from './components/TaskItem.vue';
import TaskModal from './components/TaskModal.vue';
import Toast from './components/Toast.vue';

const { applyTheme } = useTheme();
const { showToast } = useToast();

const todos = ref<Todo[]>([]);
const showTaskModal = ref(false);
const editingTask = ref<Todo | null>(null);
const searchQuery = ref('');
const activeCategory = ref('today');
const showSettingsModal = ref(false);
let checkInterval: number;

// Load from Rust backend
const loadTodos = async () => {
  try {
    const data: string = await invoke('load_todos');
    todos.value = JSON.parse(data);
  } catch (e) {
    console.error('Failed to load todos:', e);
    // Dummy data for testing if no rust backend available
    todos.value = [
      { id: '1', title: '写日报', completed: false, timeText: '17:00' },
      { id: '2', title: 'Vue组件开发', completed: true, timeText: '14:00' },
      { id: '3', title: '学习 Rust', completed: false, timeText: '20:00' },
      { id: '4', title: '去健身房', completed: false, timeText: '明天 19:00' },
      { id: '5', title: '买牛奶', completed: false, timeText: '明天 18:00' }
    ];
  }
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
  applyTheme();

  // Notification checker: run every minute
  checkInterval = window.setInterval(async () => {
    const now = new Date().getTime();
    let hasUpdates = false;
    
    // Check system notification permission
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }
    
    todos.value.forEach(task => {
      if (!task.completed && task.notify && task.dueDate && !task.notified) {
        const dueTime = new Date(task.dueDate).getTime();
        const diffMinutes = (dueTime - now) / (1000 * 60);
        
        // Notify if within 15 mins before due, up to 5 mins after due
        if (diffMinutes <= 15 && diffMinutes > -5) {
          const minsStr = Math.max(1, Math.round(diffMinutes));
          const msg = `「${task.title}」还有不到 ${minsStr} 分钟就要到期啦！`;
          
          // 1. In-app Toast and Sound
          showToast(msg);
          playBeep();
          
          // 2. System Desktop Notification
          if (permissionGranted) {
            sendNotification({ title: 'Todolist 任务临期提醒', body: msg, sound: 'default' });
          }
          
          task.notified = true;
          hasUpdates = true;
        }
      }
    });
    
    if (hasUpdates) {
      saveTodos();
    }
  }, 60000);
});

onUnmounted(() => {
  if (checkInterval) clearInterval(checkInterval);
});

const formatTimeText = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  
  const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.getDate() === tomorrow.getDate() && d.getMonth() === tomorrow.getMonth() && d.getFullYear() === tomorrow.getFullYear();
  
  const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  if (isToday) return timePart;
  if (isTomorrow) return `明天 ${timePart}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${timePart}`;
};

const saveTask = (taskData: { title: string; dueDate: string; notify: boolean }) => {
  if (editingTask.value) {
    editingTask.value.title = taskData.title;
    editingTask.value.timeText = formatTimeText(taskData.dueDate);
    editingTask.value.dueDate = taskData.dueDate;
    editingTask.value.notify = taskData.notify;
  } else {
    todos.value.unshift({
      id: Date.now().toString(),
      title: taskData.title,
      completed: false,
      timeText: formatTimeText(taskData.dueDate),
      dueDate: taskData.dueDate,
      notify: taskData.notify
    });
  }
  showTaskModal.value = false;
  editingTask.value = null;
  saveTodos();
};

const toggleComplete = (task: Todo) => {
  task.completed = !task.completed;
  saveTodos();
};

const deleteTask = (id: string) => {
  todos.value = todos.value.filter(t => t.id !== id);
  saveTodos();
};

const editTask = (task: Todo) => {
  editingTask.value = task;
  showTaskModal.value = true;
};

const filteredTodos = computed(() => {
  let result = todos.value;
  if (searchQuery.value) {
    result = result.filter(t => t.title.toLowerCase().includes(searchQuery.value.toLowerCase()));
  }
  
  if (activeCategory.value === 'today') {
    result = result.filter(t => !t.timeText.includes('明天'));
  } else if (activeCategory.value === 'completed') {
    result = result.filter(t => t.completed);
  } else if (activeCategory.value === 'my') {
    result = result;
  }
  
  return result;
});

const todayCount = computed(() => todos.value.filter(t => !t.completed && !t.timeText.includes('明天')).length);
const myTaskCount = computed(() => todos.value.filter(t => !t.completed).length);
const completedCount = computed(() => todos.value.filter(t => t.completed).length);
const allCount = computed(() => todos.value.length);

const currentDate = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

const handleAddTaskClick = () => {
  editingTask.value = null;
  showTaskModal.value = true;
  activeCategory.value = 'today';
};
</script>

<template>
  <Sidebar 
    v-model:activeCategory="activeCategory"
    :todayCount="todayCount"
    :myTaskCount="myTaskCount"
    :completedCount="completedCount"
    :allCount="allCount"
    @add-task-clicked="handleAddTaskClick"
    @open-settings="showSettingsModal = true"
  />

  <!-- Main Content -->
  <main class="main-content">
    <header class="header">
      <div class="header-left">
        <h1>
          {{ activeCategory === 'today' ? '今天' : activeCategory === 'completed' ? '已完成' : activeCategory === 'my' ? '我的任务' : '全部任务' }}
        </h1>
        <div class="date">{{ currentDate }}</div>
      </div>
      <div class="header-right">
        <div class="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" placeholder="搜索任务..." v-model="searchQuery">
        </div>
        <button class="new-task-btn" @click="showTaskModal = true">
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
          @edit="editTask"
        />
      </TransitionGroup>
      
      <div v-if="filteredTodos.length === 0 && !showTaskModal" class="no-more">
        没有更多任务了
      </div>
    </div>
  </main>

  <TaskModal :show="showTaskModal" :initialTask="editingTask" @close="showTaskModal = false; editingTask = null;" @save="saveTask" />
  <SettingsModal :show="showSettingsModal" @close="showSettingsModal = false" />
  <Toast />
</template>
