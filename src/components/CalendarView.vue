<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Todo } from '../types';
import TaskItem from './TaskItem.vue';

const props = defineProps<{
  todos: Todo[];
  selectedTaskId: string | null;
}>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'toggle', task: Todo): void;
  (e: 'delete', id: string): void;
  (e: 'update-task', updated: Todo): void;
  (e: 'switch-to-list'): void;
}>();

// Date State
const now = new Date();
const currentYear = ref(now.getFullYear());
const currentMonth = ref(now.getMonth()); // 0-11
const viewType = ref<'month' | 'list'>('month');

const getTodayDateStr = () => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const selectedDateStr = ref(getTodayDateStr());

const formatYYYYMMDD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Navigation
const goToToday = () => {
  currentYear.value = now.getFullYear();
  currentMonth.value = now.getMonth();
  selectedDateStr.value = getTodayDateStr();
};

const prevMonth = () => {
  if (currentMonth.value === 0) {
    currentMonth.value = 11;
    currentYear.value--;
  } else {
    currentMonth.value--;
  }
};

const nextMonth = () => {
  if (currentMonth.value === 11) {
    currentMonth.value = 0;
    currentYear.value++;
  } else {
    currentMonth.value++;
  }
};

const handleViewTypeChange = (type: 'month' | 'list') => {
  if (type === 'list') {
    emit('switch-to-list');
  } else {
    viewType.value = type;
  }
};

// Task date matching helper
const getTaskDateStr = (task: Todo): string => {
  if (task.startTime) {
    return task.startTime.substring(0, 10);
  }
  if (task.dueDate) {
    return task.dueDate.substring(0, 10);
  }
  if (task.completedAt) {
    return task.completedAt;
  }
  return '';
};

// Tasks map by YYYY-MM-DD
const tasksByDateMap = computed(() => {
  const map = new Map<string, Todo[]>();
  props.todos.forEach(task => {
    const dStr = getTaskDateStr(task);
    if (dStr) {
      if (!map.has(dStr)) {
        map.set(dStr, []);
      }
      map.get(dStr)!.push(task);
    }
  });
  return map;
});

// Month Calendar Grid Cells
interface CalendarDayCell {
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  tasks: Todo[];
  status: 'pending' | 'completed' | 'partial' | 'none';
}

const calendarGridCells = computed(() => {
  const year = currentYear.value;
  const month = currentMonth.value;

  const firstDayOfMonth = new Date(year, month, 1);
  const startDayOfWeek = firstDayOfMonth.getDay(); // 0 (Sun) to 6 (Sat)
  
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells: CalendarDayCell[] = [];

  // Previous month overflow
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    const dateObj = new Date(year, month - 1, dayNum);
    const dateStr = formatYYYYMMDD(dateObj);
    const dayTasks = tasksByDateMap.value.get(dateStr) || [];
    
    cells.push({
      dateStr,
      dayNumber: dayNum,
      isCurrentMonth: false,
      isToday: dateStr === getTodayDateStr(),
      isSelected: dateStr === selectedDateStr.value,
      tasks: dayTasks,
      status: getDayStatus(dayTasks),
    });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const dateObj = new Date(year, month, i);
    const dateStr = formatYYYYMMDD(dateObj);
    const dayTasks = tasksByDateMap.value.get(dateStr) || [];

    cells.push({
      dateStr,
      dayNumber: i,
      isCurrentMonth: true,
      isToday: dateStr === getTodayDateStr(),
      isSelected: dateStr === selectedDateStr.value,
      tasks: dayTasks,
      status: getDayStatus(dayTasks),
    });
  }

  // Next month overflow to complete grid
  const remaining = 35 - cells.length > 0 ? 35 - cells.length : (42 - cells.length) % 7;
  for (let i = 1; i <= remaining; i++) {
    const dateObj = new Date(year, month + 1, i);
    const dateStr = formatYYYYMMDD(dateObj);
    const dayTasks = tasksByDateMap.value.get(dateStr) || [];

    cells.push({
      dateStr,
      dayNumber: i,
      isCurrentMonth: false,
      isToday: dateStr === getTodayDateStr(),
      isSelected: dateStr === selectedDateStr.value,
      tasks: dayTasks,
      status: getDayStatus(dayTasks),
    });
  }

  return cells;
});

function getDayStatus(tasks: Todo[]): 'pending' | 'completed' | 'partial' | 'none' {
  if (tasks.length === 0) return 'none';
  const completedCount = tasks.filter(t => t.completed).length;
  if (completedCount === tasks.length) return 'completed';
  if (completedCount > 0) return 'partial';
  return 'pending';
}

const selectDate = (cell: CalendarDayCell) => {
  selectedDateStr.value = cell.dateStr;
  const [y, m] = cell.dateStr.split('-').map(Number);
  currentYear.value = y;
  currentMonth.value = m - 1;
};

// Selected Day Panel Info
const selectedDayTasks = computed(() => {
  return tasksByDateMap.value.get(selectedDateStr.value) || [];
});

const formattedSelectedDateTitle = computed(() => {
  if (!selectedDateStr.value) return '';
  const [y, m, d] = selectedDateStr.value.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${y}年 ${m}月 ${d}日 ${weekdays[dateObj.getDay()]}`;
});

// Month Stats (任务概览)
const monthStats = computed(() => {
  const y = currentYear.value;
  const m = currentMonth.value;

  const monthTasks = props.todos.filter(t => {
    const dStr = getTaskDateStr(t);
    if (!dStr) return false;
    const [taskY, taskM] = dStr.split('-').map(Number);
    return taskY === y && taskM === (m + 1);
  });

  const total = monthTasks.length;
  const completed = monthTasks.filter(t => t.completed).length;
  const pending = total - completed;
  const rate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0';

  return { total, completed, pending, rate };
});
</script>

<template>
  <div class="calendar-view-container">
    
    <!-- Top Section: Calendar Grid & Selected Day Task List -->
    <div class="calendar-main-grid">
      
      <!-- Left Panel: Calendar Month Grid -->
      <div class="calendar-left-panel">
        
        <!-- Header & Nav Bar -->
        <div class="calendar-toolbar">
          <div class="nav-controls">
            <button class="today-btn" @click="goToToday">今天</button>
            <button class="nav-arrow-btn" @click="prevMonth" title="上一月">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <button class="nav-arrow-btn" @click="nextMonth" title="下一月">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
            <span class="month-title">{{ currentYear }}年 {{ currentMonth + 1 }}月</span>
          </div>

          <div class="view-switch-pills">
            <button 
              class="pill-btn" 
              :class="{ active: viewType === 'month' }" 
              @click="handleViewTypeChange('month')"
            >
              月视图
            </button>
            <button 
              class="pill-btn" 
              @click="handleViewTypeChange('list')"
            >
              列表视图
            </button>
          </div>
        </div>

        <!-- Weekday Headers -->
        <div class="calendar-grid-header">
          <span>周日</span>
          <span>周一</span>
          <span>周二</span>
          <span>周三</span>
          <span>周四</span>
          <span>周五</span>
          <span>周六</span>
        </div>

        <!-- Calendar Days Grid -->
        <div class="calendar-days-grid">
          <div 
            v-for="cell in calendarGridCells" 
            :key="cell.dateStr" 
            class="day-cell"
            :class="{ 
              'other-month': !cell.isCurrentMonth, 
              'is-selected': cell.isSelected,
              'is-today': cell.isToday 
            }"
            @click="selectDate(cell)"
          >
            <div class="day-number-wrapper">
              <span class="day-number">{{ cell.dayNumber }}</span>
            </div>

            <!-- Task Status Indicator Dots -->
            <div class="status-dots" v-if="cell.status !== 'none'">
              <span v-if="cell.status === 'pending'" class="dot pending-dot"></span>
              <span v-else-if="cell.status === 'completed'" class="dot completed-dot"></span>
              <span v-else-if="cell.status === 'partial'" class="dot partial-dot"></span>
            </div>
          </div>
        </div>

        <!-- Legend Footer -->
        <div class="calendar-legend">
          <div class="legend-item">
            <span class="dot pending-dot"></span>
            <span>有任务</span>
          </div>
          <div class="legend-item">
            <span class="dot completed-dot"></span>
            <span>已完成任务</span>
          </div>
          <div class="legend-item">
            <span class="dot partial-dot"></span>
            <span>部分完成</span>
          </div>
        </div>
      </div>

      <!-- Right Panel: Selected Day Task Schedule -->
      <div class="calendar-right-panel">
        <div class="panel-header">
          <h3 class="selected-date-text">{{ formattedSelectedDateTitle }}</h3>
          <span class="task-count-badge">{{ selectedDayTasks.length }} 个任务</span>
        </div>

        <div class="selected-tasks-list">
          <TaskItem 
            v-for="task in selectedDayTasks" 
            :key="task.id" 
            :task="task" 
            :isSelected="task.id === selectedTaskId"
            @select="emit('select', $event)"
            @toggle="emit('toggle', $event)"
            @delete="emit('delete', $event)"
            @update-task="emit('update-task', $event)"
          />

          <div v-if="selectedDayTasks.length === 0" class="empty-day-state">
            <svg class="empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
              <circle cx="12" cy="15" r="2"></circle>
            </svg>
            <p>没有更多任务了，休息一下吧~</p>
          </div>
        </div>
      </div>

    </div>

    <!-- Bottom Section: Task Statistics Overview (任务概览) -->
    <div class="stats-overview-section">
      <h3 class="overview-title">任务概览</h3>
      <div class="stats-cards-grid">
        
        <!-- Card 1: 本月任务 -->
        <div class="stat-card">
          <div class="stat-icon-box theme-primary">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          </div>
          <div class="stat-info">
            <span class="stat-label">本月任务</span>
            <span class="stat-value">{{ monthStats.total }} 个</span>
          </div>
        </div>

        <!-- Card 2: 已完成 -->
        <div class="stat-card">
          <div class="stat-icon-box purple">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          </div>
          <div class="stat-info">
            <span class="stat-label">已完成</span>
            <span class="stat-value">{{ monthStats.completed }} 个</span>
          </div>
        </div>

        <!-- Card 3: 待完成 -->
        <div class="stat-card">
          <div class="stat-icon-box blue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <div class="stat-info">
            <span class="stat-label">待完成</span>
            <span class="stat-value">{{ monthStats.pending }} 个</span>
          </div>
        </div>

        <!-- Card 4: 完成率 -->
        <div class="stat-card">
          <div class="stat-icon-box green">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          </div>
          <div class="stat-info">
            <span class="stat-label">完成率</span>
            <span class="stat-value">{{ monthStats.rate }}%</span>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>

<style scoped>
.calendar-view-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  padding-bottom: 24px;
}

/* Layout Grid */
.calendar-main-grid {
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: 20px;
  align-items: stretch;
}

/* Left Panel: Calendar Grid */
.calendar-left-panel {
  background-color: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.03);
}

.calendar-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.nav-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.today-btn {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 5px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.today-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.nav-arrow-btn {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-arrow-btn:hover {
  color: var(--text-main);
  border-color: var(--text-muted);
}

.month-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
  margin-left: 6px;
}

/* View Switch Pills */
.view-switch-pills {
  display: flex;
  background: var(--bg-main);
  padding: 3px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  gap: 2px;
}

.pill-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.pill-btn:hover {
  color: var(--text-main);
}

.pill-btn.active {
  background: var(--primary-color);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--primary-color) 35%, transparent);
}

/* Calendar Days Grid */
.calendar-grid-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 12px;
}

.calendar-days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  flex: 1;
}

.day-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.18s ease;
  user-select: none;
}

.day-cell:hover {
  background-color: var(--bg-main);
}

.day-cell.other-month {
  opacity: 0.35;
}

.day-number-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.day-number {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-main);
}

.day-cell.is-selected .day-number-wrapper {
  background: var(--primary-color);
  box-shadow: 0 0 12px color-mix(in srgb, var(--primary-color) 50%, transparent);
}

.day-cell.is-selected .day-number {
  color: #ffffff;
  font-weight: 600;
}

/* Status Indicator Dots */
.status-dots {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  height: 6px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.pending-dot {
  background-color: #ef4444;
}

.completed-dot {
  background-color: #10b981;
}

.partial-dot {
  background-color: #f59e0b;
}

/* Calendar Legend Footer */
.calendar-legend {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  font-size: 12.5px;
  color: var(--text-secondary);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Right Panel: Selected Day Task List */
.calendar-right-panel {
  background-color: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.03);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.selected-date-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.task-count-badge {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary-color);
  background-color: var(--primary-light);
  padding: 3px 10px;
  border-radius: 12px;
}

.selected-tasks-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  overflow-y: auto;
  max-height: 420px;
}

.empty-day-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: var(--text-muted);
}

.empty-icon {
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-day-state p {
  font-size: 13.5px;
  margin: 0;
}

/* Bottom Stats Overview Section */
.stats-overview-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.overview-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.stats-cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-card {
  background-color: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.05);
}

.stat-icon-box {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon-box.theme-primary {
  background: var(--primary-light);
  color: var(--primary-color);
}

.stat-icon-box.purple {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
}

.stat-icon-box.blue {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.stat-icon-box.green {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-main);
}

/* Dark mode overrides */
:global(.dark) .calendar-left-panel,
:global(.dark) .calendar-right-panel,
:global(.dark) .stat-card {
  background-color: var(--bg-sidebar);
  border-color: var(--border-color);
}

:global(.dark) .day-cell:hover {
  background-color: var(--bg-main);
}
</style>
