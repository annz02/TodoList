import type { Todo } from '../types';

export function toYYYYMMDD(dateValue?: string | Date): string {
  if (!dateValue) return '';
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function isTodayTask(todo: Todo, now: Date): boolean {
  const todayStr = toYYYYMMDD(now);
  const startDateStr = toYYYYMMDD(todo.startTime);
  const dueDateStr = toYYYYMMDD(todo.dueDate);

  if (startDateStr && dueDateStr && startDateStr <= dueDateStr) {
    if (todayStr >= startDateStr && todayStr <= dueDateStr) {
      return true;
    }
    if (todayStr > dueDateStr) {
      return !todo.completed;
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
      return !todo.completed;
    }
  }

  if (todo.completed) {
    const completedDateStr = toYYYYMMDD(todo.completedAt);
    if (completedDateStr) {
      return completedDateStr === todayStr;
    }
  }

  return true;
}
