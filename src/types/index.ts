export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  timeText: string;
  dueDate?: string;
  notify?: boolean;
}
