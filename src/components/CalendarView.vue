<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Todo } from '../types';
import TaskItem from './TaskItem.vue';
import InlineTaskCard from './InlineTaskCard.vue';
import { getCategoryStyle } from '../utils/categoryColor';

const props = defineProps<{
  todos: Todo[];
  selectedTaskId: string | null;
  showInlineCreate?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'toggle', task: Todo): void;
  (e: 'delete', id: string): void;
  (e: 'update-task', updated: Todo): void;
  (e: 'save-inline', data: { title: string; category?: string; startTime: string; dueDate: string }): void;
  (e: 'cancel-inline'): void;
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
</script>

<template>
  <div class="calendar-view-container">
    
    <div class="calendar-main-grid">
      
      <!-- Left Panel: Full Height Calendar Month Grid -->
      <div class="calendar-left-panel">
        
        <!-- Header & Nav Bar -->
        <div class="calendar-toolbar">
          <div class="nav-controls">
            <button class="today-btn" @click="goToToday">今天</button>
            <div class="arrow-group">
              <button class="nav-arrow-btn" @click="prevMonth" title="上一月">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>
              <button class="nav-arrow-btn" @click="nextMonth" title="下一月">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </div>
            <span class="month-title">{{ currentYear }}年 {{ currentMonth + 1 }}月</span>
          </div>

          <div class="right-actions">
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

        <!-- Calendar Days Grid (Fills Left Panel Height) -->
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
            <div class="day-cell-top">
              <div class="day-number-wrapper">
                <span class="day-number">{{ cell.dayNumber }}</span>
              </div>
              <span v-if="cell.tasks.length > 0" class="mini-task-count">{{ cell.tasks.length }}项</span>
            </div>

            <!-- Mini Task Pills Preview in Grid Cell -->
            <div class="day-cell-content">
              <template v-if="cell.tasks.length > 0">
                <div 
                  v-for="t in cell.tasks.slice(0, 3)" 
                  :key="t.id" 
                  class="mini-task-pill"
                  :class="{ completed: t.completed }"
                  :title="t.title"
                  :style="{
                    '--pill-bg': getCategoryStyle(t.category).bg,
                    '--pill-color': getCategoryStyle(t.category).text,
                    '--pill-dark-bg': getCategoryStyle(t.category).darkBg,
                    '--pill-dark-color': getCategoryStyle(t.category).darkText
                  }"
                >
                  <span class="mini-task-dot"></span>
                  <span class="mini-task-title" :title="t.title">{{ t.title }}</span>
                </div>
                <div v-if="cell.tasks.length > 3" class="more-tasks-text">
                  +{{ cell.tasks.length - 3 }} 更多
                </div>
              </template>
            </div>

            <!-- Status Indicator Dots -->
            <div class="day-cell-bottom">
              <div class="status-dots" v-if="cell.status !== 'none'">
                <span v-if="cell.status === 'pending'" class="dot pending-dot"></span>
                <span v-else-if="cell.status === 'completed'" class="dot completed-dot"></span>
                <span v-else-if="cell.status === 'partial'" class="dot partial-dot"></span>
              </div>
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

      <!-- Right Panel: Full Height Selected Day Schedule -->
      <div class="calendar-right-panel">
        <div class="panel-header">
          <div class="header-info">
            <h3 class="selected-date-text">{{ formattedSelectedDateTitle }}</h3>
            <span class="task-count-badge">{{ selectedDayTasks.length }} 个任务</span>
          </div>
        </div>

        <div class="selected-tasks-list">
          <InlineTaskCard 
            v-if="showInlineCreate"
            @save="emit('save-inline', $event)"
            @cancel="emit('cancel-inline')"
          />

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

          <div v-if="!showInlineCreate && selectedDayTasks.length === 0" class="empty-day-state">
            <svg class="empty-icon" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
              <circle cx="12" cy="15" r="2"></circle>
            </svg>
            <p>该日期暂无安排任务</p>
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
  flex: 1;
  min-height: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

/* Layout Grid: Full Height 2-Column Split */
.calendar-main-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 16px;
  flex: 1;
  min-height: 0;
  height: 100%;
}

/* Left Panel: Calendar Grid */
.calendar-left-panel {
  background-color: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.02);
}

.calendar-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.nav-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.arrow-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.today-btn {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.today-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.nav-arrow-btn {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-arrow-btn:hover {
  color: var(--text-main);
  border-color: var(--text-muted);
}

.month-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
  margin-left: 4px;
  white-space: nowrap;
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
  padding: 3px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
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

/* Calendar Grid Header */
.calendar-grid-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 8px;
}

/* Calendar Days Grid (Stretches Full Height) */
.calendar-days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: 1fr;
  gap: 5px;
  flex: 1;
  min-height: 0;
}

.day-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 5px 6px;
  border-radius: 10px;
  background-color: var(--bg-main);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.18s ease;
  user-select: none;
  overflow: hidden;
}

.day-cell:hover {
  border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.day-cell.other-month {
  opacity: 0.35;
  background-color: transparent;
}

.day-cell-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 4px;
}

.day-number-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.day-number {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-main);
}

.day-cell.is-selected {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 1px var(--primary-color);
}

.day-cell.is-selected .day-number-wrapper {
  background: var(--primary-color);
}

.day-cell.is-selected .day-number {
  color: #ffffff;
  font-weight: 600;
}

.mini-task-count {
  font-size: 10.5px;
  font-weight: 500;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

/* Mini Task Pills Preview */
.day-cell-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 2px 0;
  flex: 1;
  overflow: hidden;
}

.mini-task-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1.5px 5px;
  border-radius: 4px;
  font-size: 10.8px;
  font-weight: 500;
  background-color: var(--pill-bg);
  color: var(--pill-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.mini-task-pill.completed {
  text-decoration: line-through;
  opacity: 0.6;
}

.mini-task-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: currentColor;
  flex-shrink: 0;
}

.mini-task-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.more-tasks-text {
  font-size: 10.5px;
  color: var(--text-muted);
  padding-left: 2px;
  font-weight: 500;
}

/* Status Indicator Dots */
.day-cell-bottom {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 6px;
}

.status-dots {
  display: flex;
  align-items: center;
  gap: 4px;
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
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-secondary);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Right Panel: Selected Day Task Schedule (Full Height) */
.calendar-right-panel {
  background-color: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.02);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.header-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.selected-date-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.task-count-badge {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--primary-color);
  background-color: var(--primary-light);
  padding: 2px 9px;
  border-radius: 12px;
}

.selected-tasks-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.empty-day-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-muted);
}

.empty-icon {
  margin-bottom: 10px;
  opacity: 0.4;
}

.empty-day-state p {
  font-size: 13.5px;
  margin: 0;
}

/* Dark Mode Overrides */
:global(.dark) .mini-task-pill {
  background-color: var(--pill-dark-bg);
  color: var(--pill-dark-color);
}

:global(.dark) .calendar-left-panel,
:global(.dark) .calendar-right-panel {
  background-color: var(--bg-sidebar);
  border-color: var(--border-color);
}

:global(.dark) .day-cell {
  background-color: var(--bg-sidebar);
}

:global(.dark) .day-cell:hover {
  background-color: var(--bg-main);
}

/* Responsive Adaptations for Unmaximized / Multi-range Window Sizes */
@media (max-height: 840px) {
  .mini-task-pill:nth-child(n+3) {
    display: none !important;
  }
  .more-tasks-text {
    display: none !important;
  }
}

@media (max-height: 720px) {
  .day-cell-content {
    display: none !important;
  }
  .calendar-left-panel,
  .calendar-right-panel {
    padding: 10px 12px;
  }
  .calendar-toolbar {
    margin-bottom: 6px;
  }
  .calendar-grid-header {
    padding-bottom: 4px;
    margin-bottom: 4px;
  }
  .calendar-legend {
    margin-top: 4px;
    padding-top: 4px;
  }
}

@media (max-width: 1300px) {
  .calendar-view-container {
    height: auto;
    overflow-y: auto;
  }
  .calendar-main-grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    gap: 16px;
    height: auto;
  }
  .calendar-left-panel {
    height: 500px;
    min-height: 450px;
  }
  .calendar-right-panel {
    height: 380px;
  }
}
</style>
