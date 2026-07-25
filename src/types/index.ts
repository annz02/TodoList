export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  timeText: string;
  startTime?: string;
  dueDate?: string;
  notify?: boolean;
  notified?: boolean;
  priority?: number;
  reminderOption?: string;
  repeatOption?: string;
  lastNotifiedTime?: number;
  completedAt?: string;
}
