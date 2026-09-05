export const EVENTS = {
  todosChanged: 'todos-changed',
  jumpToTask: 'jump-to-task',
  stickyVisibilityChanged: 'sticky-visibility-changed',
} as const;

export type TodosChangedPayload = { source: 'main' | 'sticky' };

export type JumpToTaskPayload = { taskId: string };

