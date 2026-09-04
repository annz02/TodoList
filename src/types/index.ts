export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  timeText: string;
  category?: string;
  startTime?: string;
  dueDate?: string;
  priority?: number;
  completedAt?: string;
  gitUrl?: string;
}
