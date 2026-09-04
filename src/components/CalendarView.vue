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
  initialStartTime?: string;
}>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'toggle', task: Todo): void;
  (e: 'delete', id: string): void;
  (e: 'update-task', updated: Todo): void;
  (e: 'save-inline', data: { title: string; category?: string; startTime: string; dueDate: string; gitUrl?: string }): void;
  (e: 'cancel-inline'): void;
  (e: 'open-create', initialStartTime?: string): void;
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

// Task date matching helper to support multi-day / date-range tasks
const getTaskDateRange = (task: Todo): string[] => {
  const startStr = task.startTime ? task.startTime.substring(0, 10) : '';
  const endStr = task.dueDate ? task.dueDate.substring(0, 10) : '';

  if (startStr && endStr && startStr <= endStr) {
    const dates: string[] = [];
    const current = new Date(`${startStr}T00:00:00`);
    const end = new Date(`${endStr}T00:00:00`);
    
    let count = 0;
    while (current <= end && count < 366) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
      
      current.setDate(current.getDate() + 1);
      count++;
    }
    return dates;
  }

  const singleDate = startStr || endStr || task.completedAt || '';
  return singleDate ? [singleDate] : [];
};

// Tasks map by YYYY-MM-DD
const tasksByDateMap = computed(() => {
  const map = new Map<string, Todo[]>();
  props.todos.forEach(task => {
    const dates = getTaskDateRange(task);
    dates.forEach(dStr => {
      if (!map.has(dStr)) {
        map.set(dStr, []);
      }
      map.get(dStr)!.push(task);
    });
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
  const totalSoFar = cells.length;
  const targetTotal = totalSoFar > 35 ? 42 : 35;
  const remaining = targetTotal - totalSoFar;

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

// Interactive Modals State
const activeTaskDetail = ref<Todo | null>(null);
const activeDayOverview = ref<{ dateStr: string; dateTitle: string; tasks: Todo[] } | null>(null);

const openTaskCard = (event: MouseEvent | null, task: Todo) => {
  if (event) event.stopPropagation();
  activeTaskDetail.value = task;
  emit('select', task.id);
};

const handleUpdateDetail = (updated: Todo) => {
  emit('update-task', updated);
  activeTaskDetail.value = updated;
};

const handleToggleDetail = (task: Todo) => {
  emit('toggle', task);
  if (activeTaskDetail.value && activeTaskDetail.value.id === task.id) {
    activeTaskDetail.value.completed = !activeTaskDetail.value.completed;
  }
};

const handleDeleteDetail = (id: string) => {
  emit('delete', id);
  activeTaskDetail.value = null;
};

const handleDayCellClick = (cell: CalendarDayCell) => {
  selectedDateStr.value = cell.dateStr;
  const [y, m] = cell.dateStr.split('-').map(Number);
  currentYear.value = y;
  currentMonth.value = m - 1;

  // Single-clicking blank cell area opens new task creation modal pre-filled with date
  emit('open-create', `${cell.dateStr}T09:00`);
};

const handleDayDblClick = (cell: CalendarDayCell) => {
  handleDayCellClick(cell);
};

const handleMoreClick = (event: MouseEvent, cell: CalendarDayCell) => {
  event.stopPropagation();
  const [year, month, day] = cell.dateStr.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const dateTitle = `${year}年 ${month}月 ${day}日 ${weekdays[dateObj.getDay()]}`;

  activeDayOverview.value = {
    dateStr: cell.dateStr,
    dateTitle,
    tasks: cell.tasks
  };
};

const handleCreateForDay = (dateStr: string) => {
  activeDayOverview.value = null;
  emit('open-create', `${dateStr}T09:00`);
};

const weekdaysHeader = [
  { full: '周日', short: '日' },
  { full: '周一', short: '一' },
  { full: '周二', short: '二' },
  { full: '周三', short: '三' },
  { full: '周四', short: '四' },
  { full: '周五', short: '五' },
  { full: '周六', short: '六' }
];
</script>

<template>
  <div class="calendar-view-container">
    
    <!-- Full Width Calendar Grid Panel -->
    <div class="calendar-left-panel">
      
      <!-- Header & Toolbar -->
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
            <button class="pill-btn active" @click="handleViewTypeChange('month')">月视图</button>
            <button class="pill-btn" @click="handleViewTypeChange('list')">列表视图</button>
          </div>
        </div>
      </div>

      <!-- Calendar Grid Container -->
      <div class="calendar-grid-wrapper">
        
        <!-- Weekday Headers -->
        <div class="calendar-grid-header">
          <span v-for="(day, idx) in weekdaysHeader" :key="idx" class="weekday-item">
            <span class="weekday-full">{{ day.full }}</span>
            <span class="weekday-short">{{ day.short }}</span>
          </span>
        </div>

        <!-- Days Grid -->
        <div class="calendar-days-grid" :class="{ 'grid-6-weeks': calendarGridCells.length > 35 }">
          <div 
            v-for="cell in calendarGridCells" 
            :key="cell.dateStr" 
            class="day-cell"
            :class="{ 
              'other-month': !cell.isCurrentMonth, 
              'is-selected': cell.isSelected,
              'is-today': cell.isToday 
            }"
            @click="handleDayCellClick(cell)"
            @dblclick="handleDayDblClick(cell)"
          >
            <div class="day-cell-top">
              <div class="day-number-wrapper">
                <span class="day-number">{{ cell.dayNumber }}</span>
              </div>
              <span v-if="cell.tasks.length > 0" class="mini-task-count">{{ cell.tasks.length }}项</span>
            </div>

            <!-- Mini Task Pills Preview -->
            <div class="day-cell-content">
              <template v-if="cell.tasks.length > 0">
                <div 
                  v-for="t in cell.tasks.slice(0, 2)" 
                  :key="t.id" 
                  class="mini-task-pill"
                  :class="{ completed: t.completed }"
                  :title="t.title + ' (点击弹框查看与编辑)'"
                  :style="{
                    '--pill-bg': getCategoryStyle(t.category).bg,
                    '--pill-color': getCategoryStyle(t.category).text,
                    '--pill-dark-bg': getCategoryStyle(t.category).darkBg,
                    '--pill-dark-color': getCategoryStyle(t.category).darkText
                  }"
                  @click="openTaskCard($event, t)"
                >
                  <span class="mini-task-dot"></span>
                  <span class="mini-task-title">{{ t.title }}</span>
                </div>
                <div 
                  v-if="cell.tasks.length > 2" 
                  class="more-tasks-pill" 
                  @click="handleMoreClick($event, cell)"
                  title="查看该日所有任务"
                >
                  +{{ cell.tasks.length - 2 }} 更多
                </div>
              </template>
            </div>

            <!-- Status Indicator Dots -->
            <div class="day-cell-bottom">
              <div class="status-dots" v-if="cell.status !== 'none'">
                <span v-if="cell.status === 'pending'" class="dot pending-dot" title="有待办任务"></span>
                <span v-else-if="cell.status === 'completed'" class="dot completed-dot" title="任务已全部完成"></span>
                <span v-else-if="cell.status === 'partial'" class="dot partial-dot" title="有部分完成任务"></span>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- Legend Footer -->
      <div class="calendar-legend">
        <div class="legend-item">
          <span class="dot pending-dot"></span>
          <span>待办</span>
        </div>
        <div class="legend-item">
          <span class="dot partial-dot"></span>
          <span>进行中</span>
        </div>
        <div class="legend-item">
          <span class="dot completed-dot"></span>
          <span>已完成</span>
        </div>
      </div>

    </div>

    <!-- Modal 1: Create New Task Modal (Direct Card on Backdrop) -->
    <Transition name="fade">
      <div v-if="showInlineCreate" class="task-card-modal-backdrop" @click="emit('cancel-inline')">
        <div class="direct-card-container" @click.stop>
          <InlineTaskCard 
            :initialStartTime="initialStartTime"
            @save="emit('save-inline', $event)"
            @cancel="emit('cancel-inline')"
          />
        </div>
      </div>
    </Transition>

    <!-- Modal 2: Task Detail & Edit Modal (Direct Card on Backdrop) -->
    <Transition name="fade">
      <div v-if="activeTaskDetail" class="task-card-modal-backdrop" @click="activeTaskDetail = null">
        <div class="direct-card-container" @click.stop>
          <TaskItem 
            :task="activeTaskDetail"
            :isSelected="true"
            @toggle="handleToggleDetail"
            @delete="handleDeleteDetail"
            @update-task="handleUpdateDetail"
          />
        </div>
      </div>
    </Transition>

    <!-- Modal 3: Day Overview Modal -->
    <Transition name="fade">
      <div v-if="activeDayOverview" class="task-card-modal-backdrop" @click="activeDayOverview = null">
        <div class="modal-card-wrapper day-overview-wrapper" @click.stop>
          <div class="modal-card-header">
            <div class="header-title-group">
              <span class="modal-card-title">{{ activeDayOverview.dateTitle }}</span>
              <span class="count-badge">{{ activeDayOverview.tasks.length }} 个任务</span>
            </div>
            <button class="modal-close-btn" @click="activeDayOverview = null" title="关闭">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <div class="day-overview-list">
            <TaskItem 
              v-for="task in activeDayOverview.tasks" 
              :key="task.id" 
              :task="task" 
              :isSelected="task.id === selectedTaskId"
              @select="openTaskCard(null, task)"
              @toggle="emit('toggle', $event)"
              @delete="emit('delete', $event)"
              @update-task="emit('update-task', $event)"
            />
          </div>

          <div class="day-overview-footer">
            <button class="create-for-day-btn" @click="handleCreateForDay(activeDayOverview.dateStr)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              在此日期添加任务
            </button>
          </div>
        </div>
      </div>
    </Transition>

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
  max-width: 1600px;
  margin: 0 auto;
  overflow: hidden;
  box-sizing: border-box;
  position: relative;
}

/* Full Width Calendar Grid Layout */
.calendar-left-panel {
  background-color: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  min-width: 0;
  width: 100%;
}

/* Toolbar Controls */
.calendar-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 12px;
  flex-wrap: wrap;
  flex-shrink: 0;
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
  padding: 5px 13px;
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
  font-size: clamp(15px, 1.4vw, 18px);
  font-weight: 600;
  color: var(--text-main);
  margin-left: 4px;
  white-space: nowrap;
}

/* Right Actions Toolbar */
.right-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

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
  padding: 4px 10px;
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

/* Wrapper for Grid to Ensure Responsive Proportions */
.calendar-grid-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background-color: var(--bg-main);
}

/* Calendar Grid Header (Weekdays) */
.calendar-grid-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 10px 0;
  background-color: var(--bg-sidebar);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 10;
}

.weekday-short {
  display: none;
}

/* Unified Table-like Calendar Days Grid */
.calendar-days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: minmax(clamp(82px, 11vh, 135px), 1fr);
  gap: 1px;
  background-color: var(--border-color);
  flex: 1;
}

/* Individual Cell Sizing & Styling */
.day-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 6px 8px;
  background-color: var(--bg-main);
  cursor: pointer;
  transition: background-color 0.18s ease, box-shadow 0.18s ease;
  user-select: none;
  overflow: hidden;
  box-sizing: border-box;
}

.day-cell:hover {
  background-color: color-mix(in srgb, var(--primary-color) 4%, var(--bg-main));
}

.day-cell.other-month {
  background-color: color-mix(in srgb, var(--bg-sidebar) 50%, var(--bg-main));
  opacity: 0.45;
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
  font-size: 13px;
  font-weight: 500;
  color: var(--text-main);
}

.day-cell.is-selected {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
  z-index: 2;
  background-color: color-mix(in srgb, var(--primary-color) 6%, var(--bg-main));
}

.day-cell.is-selected .day-number-wrapper {
  background: var(--primary-color);
}

.day-cell.is-selected .day-number {
  color: #ffffff;
  font-weight: 600;
}

.day-cell.is-today .day-number {
  color: var(--primary-color);
  font-weight: 700;
}

.day-cell.is-today:not(.is-selected) .day-number-wrapper {
  background-color: var(--primary-light);
}

.day-cell.is-today.is-selected .day-number {
  color: #ffffff;
}

.mini-task-count {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

/* Mini Task Pills Preview */
.day-cell-content {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 3px 0;
  flex: 1;
  overflow: hidden;
}

.mini-task-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2.5px 6px;
  border-radius: 4px;
  font-size: clamp(9.5px, 0.75vw, 11px);
  font-weight: 500;
  background-color: var(--pill-bg);
  color: var(--pill-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.25;
  transition: transform 0.15s ease, filter 0.15s ease;
}

.mini-task-pill:hover {
  transform: translateY(-1px);
  filter: brightness(0.95);
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

.more-tasks-pill {
  font-size: 10px;
  font-weight: 600;
  color: var(--primary-color);
  background-color: var(--primary-light);
  padding: 2px 6px;
  border-radius: 4px;
  width: fit-content;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.more-tasks-pill:hover {
  background-color: color-mix(in srgb, var(--primary-color) 25%, transparent);
}

/* Status Indicator Dots */
.day-cell-bottom {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 6px;
  margin-top: 1px;
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
  gap: 18px;
  margin-top: 12px;
  padding-top: 6px;
  font-size: 11.5px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Modal Backdrop & Framed Modal Wrappers */
.task-card-modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(5px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.direct-card-container {
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  box-sizing: border-box;
  animation: popIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-card-wrapper {
  background-color: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
  width: 100%;
  max-width: 520px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 18px 20px;
  box-sizing: border-box;
  animation: popIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes popIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border-color);
  width: 100%;
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
}

.modal-close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.modal-close-btn:hover {
  background-color: var(--bg-main);
  color: var(--text-main);
}

.count-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--primary-color);
  background: var(--primary-light);
  padding: 2px 8px;
  border-radius: 10px;
}

.day-overview-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 380px;
  overflow-y: auto;
  padding: 4px 2px 12px 2px;
}

.day-overview-footer {
  padding-top: 12px;
  margin-top: 8px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
}

.create-for-day-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--primary-color);
  color: #ffffff;
  border: none;
  padding: 7.5px 15px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.create-for-day-btn:hover {
  background: var(--primary-hover);
}

/* Fade animation */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.22s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* Dark Mode Overrides */
:global(.dark) .mini-task-pill {
  background-color: var(--pill-dark-bg);
  color: var(--pill-dark-color);
}

:global(.dark) .calendar-left-panel,
:global(.dark) .modal-card-wrapper {
  background-color: var(--bg-sidebar);
  border-color: var(--border-color);
}

:global(.dark) .day-cell {
  background-color: var(--bg-sidebar);
}

:global(.dark) .day-cell.other-month {
  background-color: #1a2332;
}

:global(.dark) .day-cell:hover {
  background-color: color-mix(in srgb, var(--primary-color) 10%, var(--bg-sidebar));
}

:global(.dark) .calendar-grid-header {
  background-color: var(--bg-sidebar);
}
</style>
