<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';

interface Todo {
  id: string;
  title: string;
  completed: boolean;
  timeText: string;
}

const todos = ref<Todo[]>([]);
const newTaskTitle = ref('');
const showAddInput = ref(false);
const searchQuery = ref('');
const activeCategory = ref('today');

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

onMounted(() => {
  loadTodos();
  applyTheme();
});

const showSettingsModal = ref(false);
const themeMode = ref(localStorage.getItem('themeMode') || 'light');
const primaryColor = ref(localStorage.getItem('primaryColor') || '#3b82f6');

const themeColors = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
];

const applyTheme = () => {
  if (themeMode.value === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  document.documentElement.style.setProperty('--primary-color', primaryColor.value);
};

const setThemeMode = (mode: string) => {
  themeMode.value = mode;
  localStorage.setItem('themeMode', mode);
  applyTheme();
};

const setPrimaryColor = (color: string) => {
  primaryColor.value = color;
  localStorage.setItem('primaryColor', color);
  applyTheme();
};

const addTask = () => {
  if (newTaskTitle.value.trim() === '') {
    showAddInput.value = false;
    return;
  }
  todos.value.unshift({
    id: Date.now().toString(),
    title: newTaskTitle.value,
    completed: false,
    timeText: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
  });
  newTaskTitle.value = '';
  showAddInput.value = false;
  saveTodos();
};

const toggleComplete = (todo: Todo) => {
  todo.completed = !todo.completed;
  saveTodos();
};

const deleteTask = (id: string) => {
  todos.value = todos.value.filter(t => t.id !== id);
  saveTodos();
};

const filteredTodos = computed(() => {
  let result = todos.value;
  if (searchQuery.value) {
    result = result.filter(t => t.title.toLowerCase().includes(searchQuery.value.toLowerCase()));
  }
  
  if (activeCategory.value === 'today') {
    // just a mock, assuming all are today for now except maybe specific ones
    result = result.filter(t => !t.timeText.includes('明天'));
  } else if (activeCategory.value === 'completed') {
    result = result.filter(t => t.completed);
  } else if (activeCategory.value === 'my') {
    // mock my tasks
    result = result;
  }
  
  return result;
});

const todayCount = computed(() => todos.value.filter(t => !t.completed && !t.timeText.includes('明天')).length);
const myTaskCount = computed(() => todos.value.filter(t => !t.completed).length);
const completedCount = computed(() => todos.value.filter(t => t.completed).length);
const allCount = computed(() => todos.value.length);

const currentDate = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
</script>

<template>
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="logo-area">
      <div style="display: flex; align-items: center;">
        <img src="/logo.png" alt="Logo" style="width: 32px; height: 32px; margin-right: 12px; border-radius: 6px; object-fit: contain;" />
        <span style="font-size: 1.25rem;">Todolist</span>
      </div>
      <svg class="plus-btn" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" @click="showAddInput = true; activeCategory = 'today'">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </div>

    <div class="menu">
      <div class="menu-item" :class="{active: activeCategory === 'today'}" @click="activeCategory = 'today'">
        <div class="left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
          今天
        </div>
        <span class="badge">{{ todayCount }}</span>
      </div>
      <div class="menu-item" :class="{active: activeCategory === 'my'}" @click="activeCategory = 'my'">
        <div class="left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          我的任务
        </div>
        <span class="badge">{{ myTaskCount }}</span>
      </div>
      <div class="menu-item" :class="{active: activeCategory === 'completed'}" @click="activeCategory = 'completed'">
        <div class="left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          已完成
        </div>
        <span class="badge">{{ completedCount }}</span>
      </div>
      <div class="menu-item" :class="{active: activeCategory === 'all'}" @click="activeCategory = 'all'">
        <div class="left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
          全部任务
        </div>
        <span class="badge">{{ allCount }}</span>
      </div>
    </div>

    <div class="settings" @click="showSettingsModal = true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      设置
    </div>
  </aside>

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
        <button class="new-task-btn" @click="showAddInput = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          新建任务
        </button>
      </div>
    </header>

    <input v-if="showAddInput" type="text" v-model="newTaskTitle" class="add-task-input" placeholder="输入任务标题并回车..." @keyup.enter="addTask" @blur="addTask" autofocus>

    <div class="task-list">
      <TransitionGroup name="list">
        <div class="task-item" v-for="task in filteredTodos" :key="task.id" :class="{completed: task.completed}">
          <div class="task-left">
            <div class="checkbox" @click="toggleComplete(task)">
              <svg v-if="task.completed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <span class="task-title">{{ task.title }}</span>
          </div>
          <div class="task-right">
            <span class="time">{{ task.timeText }}</span>
            <div class="actions" @click="deleteTask(task.id)" title="删除任务">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
            </div>
          </div>
        </div>
      </TransitionGroup>
      
      <div v-if="filteredTodos.length === 0 && !showAddInput" class="no-more">
        没有更多任务了
      </div>
    </div>
  </main>

  <!-- Settings Modal -->
  <div v-if="showSettingsModal" class="modal-overlay" @click="showSettingsModal = false">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2>设置</h2>
        <button class="close-btn" @click="showSettingsModal = false">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div class="setting-group">
        <label>外观模式</label>
        <div class="theme-options">
          <button class="theme-btn" :class="{active: themeMode === 'light'}" @click="setThemeMode('light')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
            浅色
          </button>
          <button class="theme-btn" :class="{active: themeMode === 'dark'}" @click="setThemeMode('dark')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
            深色
          </button>
        </div>
      </div>

      <div class="setting-group">
        <label>主题颜色</label>
        <div class="color-options">
          <button 
            v-for="color in themeColors" 
            :key="color"
            class="color-swatch"
            :class="{active: primaryColor === color}"
            :style="{backgroundColor: color}"
            @click="setPrimaryColor(color)"
          ></button>
        </div>
      </div>
    </div>
  </div>
</template>
