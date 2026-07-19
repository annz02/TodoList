<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { Todo } from './types';
import { useTheme } from './composables/useTheme';

// Import components
import Sidebar from './components/Sidebar.vue';
import SettingsModal from './components/SettingsModal.vue';
import TaskItem from './components/TaskItem.vue';

const { applyTheme } = useTheme();

const todos = ref<Todo[]>([]);
const newTaskTitle = ref('');
const showAddInput = ref(false);
const searchQuery = ref('');
const activeCategory = ref('today');
const showSettingsModal = ref(false);

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

const toggleComplete = (task: Todo) => {
  task.completed = !task.completed;
  saveTodos();
};

const deleteTask = (id: string) => {
  todos.value = todos.value.filter(t => t.id !== id);
  saveTodos();
};

const editTask = (task: Todo) => {
  const newTitle = prompt('修改任务内容', task.title);
  if (newTitle !== null && newTitle.trim() !== '') {
    task.title = newTitle.trim();
    saveTodos();
  }
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
  showAddInput.value = true;
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
        <button class="new-task-btn" @click="showAddInput = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          新建任务
        </button>
      </div>
    </header>

    <input 
      v-if="showAddInput" 
      type="text" 
      v-model="newTaskTitle" 
      class="add-task-input" 
      placeholder="输入任务标题并回车..." 
      @keyup.enter="addTask" 
      @blur="addTask" 
      autofocus
    >

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
      
      <div v-if="filteredTodos.length === 0 && !showAddInput" class="no-more">
        没有更多任务了
      </div>
    </div>
  </main>

  <SettingsModal :show="showSettingsModal" @close="showSettingsModal = false" />
</template>
