export const EVENTS = {
  todosChanged: 'todos-changed',
  jumpToTask: 'jump-to-task',
} as const;

export type TodosChangedPayload = { source: 'main' | 'sticky' };

export type JumpToTaskPayload = { taskId: string };
