<script setup lang="ts">
import type { Todo } from '../types';

defineProps<{ task: Todo }>();
const emit = defineEmits<{
  (e: 'toggle', task: Todo): void;
  (e: 'delete', id: string): void;
}>();
</script>

<template>
  <div class="task-item" :class="{completed: task.completed}">
    <div class="task-left">
      <div class="checkbox" @click="emit('toggle', task)">
        <svg v-if="task.completed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </div>
      <span class="task-title">{{ task.title }}</span>
    </div>
    <div class="task-right">
      <span class="time">{{ task.timeText }}</span>
      <div class="actions" @click="emit('delete', task.id)" title="删除任务">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
      </div>
    </div>
  </div>
</template>
