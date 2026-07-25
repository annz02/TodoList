<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';

const props = defineProps<{
  modelValue?: string;
  placeholder?: string;
  iconType?: 'start' | 'end';
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void;
}>();

const isOpen = ref(false);
const showTimePickerWheel = ref(false);
const pickerRef = ref<HTMLElement | null>(null);

const hourListRef = ref<HTMLElement | null>(null);
const minuteListRef = ref<HTMLElement | null>(null);

// 状态定义
const viewYear = ref(new Date().getFullYear());
const viewMonth = ref(new Date().getMonth()); // 0-11
const getNowHHmm = () => {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const selectedDateStr = ref(''); // YYYY-MM-DD
const selectedTimeStr = ref(getNowHHmm()); // HH:mm

const selectedHour = ref(String(new Date().getHours()).padStart(2, '0'));
const selectedMinute = ref(String(new Date().getMinutes()).padStart(2, '0'));

// 保持 Hour / Minute 与 selectedTimeStr 同步
watch(selectedTimeStr, (newVal) => {
  if (newVal && newVal.includes(':')) {
    const [h, m] = newVal.split(':');
    selectedHour.value = h.padStart(2, '0');
    selectedMinute.value = m.padStart(2, '0');
  }
}, { immediate: true });

const updateTimeFromSelect = () => {
  selectedTimeStr.value = `${selectedHour.value}:${selectedMinute.value}`;
  applyChange();
};

const hoursArray = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const minutesArray = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

// 解析并格式化初始数据
const parseModelValue = () => {
  if (props.modelValue && props.modelValue.includes('T')) {
    const [d, t] = props.modelValue.split('T');
    selectedDateStr.value = d;
    selectedTimeStr.value = t.substring(0, 5);
    const dateObj = new Date(d);
    if (!isNaN(dateObj.getTime())) {
      viewYear.value = dateObj.getFullYear();
      viewMonth.value = dateObj.getMonth();
      return;
    }
  }
  
  // 默认今天与当前时刻
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  
  selectedDateStr.value = `${yyyy}-${mm}-${dd}`;
  selectedTimeStr.value = getNowHHmm();
  viewYear.value = today.getFullYear();
  viewMonth.value = today.getMonth();
};

const formatDisplay = computed(() => {
  if (!props.modelValue) return '';
  const parts = props.modelValue.split('T');
  if (parts.length !== 2) return props.modelValue;
  
  const [dStr, tStr] = parts;
  const d = new Date(dStr);
  const now = new Date();
  
  const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.getDate() === tomorrow.getDate() && d.getMonth() === tomorrow.getMonth() && d.getFullYear() === tomorrow.getFullYear();
  
  const displayTime = tStr.substring(0, 5);
  if (isToday) return `今天 ${displayTime}`;
  if (isTomorrow) return `明天 ${displayTime}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${displayTime}`;
});

// 切换月份
const prevMonth = () => {
  if (viewMonth.value === 0) {
    viewMonth.value = 11;
    viewYear.value--;
  } else {
    viewMonth.value--;
  }
};

const nextMonth = () => {
  if (viewMonth.value === 11) {
    viewMonth.value = 0;
    viewYear.value++;
  } else {
    viewMonth.value++;
  }
};

// 计算日历网格
interface CalendarCell {
  dateStr: string;
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
}

const weekHeaders = ['一', '二', '三', '四', '五', '六', '日'];

const calendarCells = computed<CalendarCell[]>(() => {
  const cells: CalendarCell[] = [];
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const firstDay = new Date(viewYear.value, viewMonth.value, 1);
  let firstDayOfWeek = firstDay.getDay();
  if (firstDayOfWeek === 0) firstDayOfWeek = 7;

  // 上月填充
  const prevMonthLastDate = new Date(viewYear.value, viewMonth.value, 0).getDate();
  for (let i = firstDayOfWeek - 1; i > 0; i--) {
    const d = prevMonthLastDate - i + 1;
    const pMonth = viewMonth.value === 0 ? 11 : viewMonth.value - 1;
    const pYear = viewMonth.value === 0 ? viewYear.value - 1 : viewYear.value;
    const dateStr = `${pYear}-${String(pMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({
      dateStr,
      dayNum: d,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      isSelected: dateStr === selectedDateStr.value
    });
  }

  // 当月天数
  const daysInMonth = new Date(viewYear.value, viewMonth.value + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear.value}-${String(viewMonth.value + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({
      dateStr,
      dayNum: d,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      isSelected: dateStr === selectedDateStr.value
    });
  }

  // 下月填充
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const nMonth = viewMonth.value === 11 ? 0 : viewMonth.value + 1;
    const nYear = viewMonth.value === 11 ? viewYear.value + 1 : viewYear.value;
    const dateStr = `${nYear}-${String(nMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({
      dateStr,
      dayNum: d,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      isSelected: dateStr === selectedDateStr.value
    });
  }

  return cells;
});

const selectCell = (cell: CalendarCell) => {
  selectedDateStr.value = cell.dateStr;
  applyChange();
};

// 快捷选项
const setQuickOption = (type: 'today' | 'tomorrow' | 'weekend' | 'nextWeek') => {
  const d = new Date();
  if (type === 'tomorrow') {
    d.setDate(d.getDate() + 1);
  } else if (type === 'weekend') {
    const day = d.getDay();
    const diff = (6 - day + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
  } else if (type === 'nextWeek') {
    d.setDate(d.getDate() + 7);
  }
  
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  selectedDateStr.value = `${yyyy}-${mm}-${dd}`;
  viewYear.value = d.getFullYear();
  viewMonth.value = d.getMonth();
  applyChange();
};

// 快捷常用时刻
const quickTimes = ['09:00', '12:00', '14:00', '18:00', '21:00'];
const setQuickTime = (t: string) => {
  selectedTimeStr.value = t;
  applyChange();
};

const applyChange = () => {
  if (selectedDateStr.value && selectedTimeStr.value) {
    emit('update:modelValue', `${selectedDateStr.value}T${selectedTimeStr.value}`);
  }
};

const handleConfirm = () => {
  applyChange();
  isOpen.value = false;
};

const toggleOpen = () => {
  if (!isOpen.value) {
    parseModelValue();
    showTimePickerWheel.value = false;
  }
  isOpen.value = !isOpen.value;
};

const toggleTimeWheel = () => {
  showTimePickerWheel.value = !showTimePickerWheel.value;
  if (showTimePickerWheel.value) {
    nextTick(() => {
      scrollToActiveItems();
    });
  }
};

const scrollToActiveItems = () => {
  if (hourListRef.value) {
    const activeHourEl = hourListRef.value.querySelector('.wheel-item.active') as HTMLElement;
    if (activeHourEl) {
      hourListRef.value.scrollTop = activeHourEl.offsetTop - hourListRef.value.clientHeight / 2 + activeHourEl.clientHeight / 2;
    }
  }
  if (minuteListRef.value) {
    const activeMinEl = minuteListRef.value.querySelector('.wheel-item.active') as HTMLElement;
    if (activeMinEl) {
      minuteListRef.value.scrollTop = activeMinEl.offsetTop - minuteListRef.value.clientHeight / 2 + activeMinEl.clientHeight / 2;
    }
  }
};

const selectHourItem = (h: string) => {
  selectedHour.value = h;
  updateTimeFromSelect();
};

const selectMinuteItem = (m: string) => {
  selectedMinute.value = m;
  updateTimeFromSelect();
};

const clearValue = (e: Event) => {
  e.stopPropagation();
  emit('update:modelValue', '');
  isOpen.value = false;
};

// 点击外部关闭
const handleClickOutside = (e: MouseEvent) => {
  if (pickerRef.value && !pickerRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="custom-date-picker" ref="pickerRef">
    <!-- Trigger Button -->
    <div class="picker-trigger" :class="{ 'is-active': isOpen, 'has-value': !!modelValue }" @click="toggleOpen">
      <svg v-if="iconType === 'start'" class="picker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      <svg v-else class="picker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>

      <span class="picker-label">
        {{ formatDisplay || placeholder || '时间' }}
      </span>

      <svg v-if="modelValue" class="clear-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" @click="clearValue" title="清除">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      <svg v-else class="arrow-icon" :class="{ open: isOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </div>

    <!-- Modern Dropdown Popover -->
    <Transition name="popover-zoom">
      <div v-if="isOpen" class="picker-popover">
        <!-- 顶部快捷 Quick Picks -->
        <div class="quick-header">
          <button class="quick-chip" @click="setQuickOption('today')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"></circle></svg>
            今天
          </button>
          <button class="quick-chip" @click="setQuickOption('tomorrow')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"></path></svg>
            明天
          </button>
          <button class="quick-chip" @click="setQuickOption('weekend')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>
            周末
          </button>
          <button class="quick-chip" @click="setQuickOption('nextWeek')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>
            下周
          </button>
        </div>

        <div class="divider"></div>

        <!-- 极简日历标头与翻页 -->
        <div class="calendar-nav">
          <span class="month-year-text">{{ viewYear }}年 {{ viewMonth + 1 }}月</span>
          <div class="nav-btns">
            <button class="nav-btn" @click="prevMonth" title="上个月">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <button class="nav-btn" @click="nextMonth" title="下个月">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
        </div>

        <!-- 日历星期标头 -->
        <div class="week-grid">
          <span v-for="w in weekHeaders" :key="w" class="week-cell">{{ w }}</span>
        </div>

        <!-- 日历天数网格 -->
        <div class="days-grid">
          <button 
            v-for="(cell, idx) in calendarCells" 
            :key="idx" 
            class="day-cell"
            :class="{ 
              'other-month': !cell.isCurrentMonth, 
              'is-today': cell.isToday, 
              'is-selected': cell.isSelected 
            }"
            @click="selectCell(cell)"
          >
            {{ cell.dayNum }}
          </button>
        </div>

        <div class="divider"></div>

        <!-- 底部时刻快捷与纯自定义双列时间下拉框 -->
        <div class="time-section">
          <div class="time-chips-grid">
            <button 
              v-for="t in quickTimes" 
              :key="t" 
              class="time-chip"
              :class="{ selected: selectedTimeStr === t }"
              @click="setQuickTime(t)"
            >
              {{ t }}
            </button>
          </div>

          <div class="time-footer-row">
            <!-- 触发展开/折叠参照日历风格的纯自定义双列时间下拉面板 -->
            <button class="custom-time-trigger" :class="{ active: showTimePickerWheel }" @click="toggleTimeWheel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>{{ selectedHour }}:{{ selectedMinute }}</span>
              <svg class="trigger-chevron" :class="{ open: showTimePickerWheel }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            
            <button class="confirm-btn" @click="handleConfirm">确定</button>
          </div>

          <!-- 完全参照日历 UI 风格设计的纯自定义双列时间选择下拉面板 -->
          <Transition name="wheel-expand">
            <div v-if="showTimePickerWheel" class="time-wheel-panel">
              <div class="wheel-column">
                <div class="column-title">小时</div>
                <div class="scroll-list" ref="hourListRef">
                  <div 
                    v-for="h in hoursArray" 
                    :key="h" 
                    class="wheel-item"
                    :class="{ active: selectedHour === h }"
                    @click="selectHourItem(h)"
                  >
                    {{ h }}
                  </div>
                </div>
              </div>

              <div class="column-divider"></div>

              <div class="wheel-column">
                <div class="column-title">分钟</div>
                <div class="scroll-list" ref="minuteListRef">
                  <div 
                    v-for="m in minutesArray" 
                    :key="m" 
                    class="wheel-item"
                    :class="{ active: selectedMinute === m }"
                    @click="selectMinuteItem(m)"
                  >
                    {{ m }}
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.custom-date-picker {
  position: relative;
  display: inline-block;
}

.picker-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.picker-trigger:hover {
  border-color: var(--primary-color);
  background-color: var(--bg-main);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
}

.picker-trigger.is-active {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px var(--primary-light);
  background-color: var(--bg-main);
}

.picker-icon {
  width: 15px;
  height: 15px;
  color: var(--text-muted);
  transition: color 0.2s;
}

.picker-trigger:hover .picker-icon,
.picker-trigger.has-value .picker-icon {
  color: var(--primary-color);
}

.picker-label {
  font-size: 13px;
  color: var(--text-muted);
  white-space: nowrap;
}

.picker-trigger.has-value .picker-label {
  color: var(--text-main);
  font-weight: 500;
}

.arrow-icon, .clear-icon {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
  transition: transform 0.2s, color 0.2s;
  margin-left: 2px;
}

.arrow-icon.open {
  transform: rotate(180deg);
}

.clear-icon:hover {
  color: var(--danger-color);
}

/* Popover Card */
.picker-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 1000;
  width: 280px;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 16px 36px -8px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(16px);
}

.divider {
  height: 1px;
  background: var(--border-color);
  margin: 10px 0;
  opacity: 0.7;
}

/* 顶部 Quick Chips */
.quick-header {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}

.quick-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 5px 0;
  font-size: 11.5px;
  color: var(--text-main);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.quick-chip:hover {
  background: var(--primary-color);
  color: #ffffff;
  border-color: var(--primary-color);
}

/* 日历 Header */
.calendar-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 0 4px;
}

.month-year-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.nav-btns {
  display: flex;
  gap: 4px;
}

.nav-btn {
  background: transparent;
  border: none;
  border-radius: 6px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s;
}

.nav-btn:hover {
  background: var(--bg-sidebar);
  color: var(--text-main);
}

/* 日历 Week & Days */
.week-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  margin-bottom: 4px;
}

.week-cell {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  padding: 4px 0;
}

.days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.day-cell {
  background: transparent;
  border: none;
  height: 30px;
  border-radius: 50%;
  font-size: 12px;
  color: var(--text-main);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.day-cell:hover:not(.is-selected) {
  background: var(--bg-sidebar);
  color: var(--primary-color);
}

.day-cell.other-month {
  color: var(--text-muted);
  opacity: 0.4;
}

.day-cell.is-today:not(.is-selected) {
  font-weight: 700;
  color: var(--primary-color);
  border: 1px solid var(--primary-color);
}

.day-cell.is-selected {
  background: var(--primary-color);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.4);
}

/* 时间选择区域 */
.time-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.time-chips-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
}

.time-chip {
  background: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px 0;
  font-size: 11px;
  text-align: center;
  color: var(--text-main);
  cursor: pointer;
  transition: all 0.15s;
}

.time-chip:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.time-chip.selected {
  background: var(--primary-color);
  color: #ffffff;
  border-color: var(--primary-color);
}

.time-footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.custom-time-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-main);
  cursor: pointer;
  transition: all 0.15s;
  flex: 1;
}

.custom-time-trigger:hover,
.custom-time-trigger.active {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--bg-main);
}

.trigger-chevron {
  margin-left: auto;
  transition: transform 0.2s;
}

.trigger-chevron.open {
  transform: rotate(180deg);
}

/* 完全参照日历 UI 风格打造的自定义双列时间选择下拉列表 */
.time-wheel-panel {
  display: flex;
  background: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 8px 4px;
  margin-top: 4px;
  height: 150px;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
}

.wheel-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
}

.column-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 6px;
  text-transform: uppercase;
}

.scroll-list {
  width: 100%;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  scroll-behavior: smooth;
}

/* 精致自定义内嵌滚动条 */
.scroll-list::-webkit-scrollbar {
  width: 4px;
}
.scroll-list::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}

.wheel-item {
  width: 100%;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-main);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.wheel-item:hover:not(.active) {
  background: var(--bg-main);
  color: var(--primary-color);
}

/* 参照日历 is-selected 选中的全酷主题风格 */
.wheel-item.active {
  background: var(--primary-color);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.4);
}

.column-divider {
  width: 1px;
  background: var(--border-color);
  margin: 12px 0 4px;
  opacity: 0.6;
}

.confirm-btn {
  background: var(--primary-color);
  color: #ffffff;
  border: none;
  border-radius: 6px;
  padding: 5px 16px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.confirm-btn:hover {
  background: var(--primary-hover);
}

/* Dropdown / Wheel Animations */
.popover-zoom-enter-active,
.popover-zoom-leave-active {
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}
.popover-zoom-enter-from,
.popover-zoom-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-4px);
}

.wheel-expand-enter-active,
.wheel-expand-leave-active {
  transition: all 0.2s ease;
}
.wheel-expand-enter-from,
.wheel-expand-leave-to {
  opacity: 0;
  max-height: 0;
  overflow: hidden;
  margin-top: 0;
  padding: 0;
}

/* Dark mode overrides */
:global(.dark) .picker-popover {
  background: var(--bg-sidebar);
  box-shadow: 0 16px 36px -8px rgba(0, 0, 0, 0.6);
}

:global(.dark) .quick-chip,
:global(.dark) .time-chip,
:global(.dark) .custom-time-trigger {
  background: var(--bg-main);
}

:global(.dark) .time-wheel-panel {
  background: var(--bg-main);
}
</style>
