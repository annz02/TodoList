<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, type StyleValue } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import type { Todo } from '../types';
import { toYYYYMMDD, isTodayTask } from '../utils/date';
import { getPaperTheme, NOTY_PALETTE, type PaperTheme } from '../utils/categoryColor';
import { EVENTS, type TodosChangedPayload } from '../events';
import { useTheme } from '../composables/useTheme';
import {
  dockLayout,
  type DockAnchor,
  type DockRectP,
  type DockState,
  MAX_VISIBLE_TABS,
  SNAP_MS,
  TAB_H,
  TAB_OVERLAP,
} from './geometry';

const { initTheme } = useTheme();

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const todos = ref<Todo[]>([]);
const now = ref(new Date());
const isDark = ref(false);
const loading = ref(true);

// ---------------------------------------------------------------------------
// Dock state machine + geometry
// ---------------------------------------------------------------------------
const state = ref<DockState>('idle');
const anchor = ref<DockAnchor | null>(null);
const activeId = ref<string | null>(null);

// Editing fields for open/create note
const editTitle = ref('');
const editDescription = ref('');
const editColor = ref('pink');
const saveStatusText = ref('Saved · just now');

const titleInputRef = ref<HTMLInputElement | null>(null);
const descTextareaRef = ref<HTMLTextAreaElement | null>(null);

const OPEN_IDLE_MS = 60000;

let idleTimer: ReturnType<typeof setTimeout> | undefined;
let saveDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let raf = 0;
let currentRect: DockRectP | null = null;
let unlistenTodos: (() => void) | undefined;

const allToday = computed(() =>
  todos.value.filter((t) => isTodayTask(t, now.value))
);

const rows = computed(() => {
  const list = allToday.value.slice();
  list.sort((a, b) => Number(a.completed) - Number(b.completed));
  return list;
});

const visibleRows = computed(() => rows.value.slice(0, MAX_VISIBLE_TABS));
const overflowCount = computed(() => Math.max(0, rows.value.length - MAX_VISIBLE_TABS));

const activeIndex = computed(() => {
  if (state.value === 'create') return Math.min(visibleRows.value.length, MAX_VISIBLE_TABS);
  const idx = visibleRows.value.findIndex((t) => t.id === activeId.value);
  return idx >= 0 ? idx : 0;
});

const cardTopPx = computed(() => {
  return 8 + activeIndex.value * (TAB_H - TAB_OVERLAP);
});

const active = computed(
  () => rows.value.find((t) => t.id === activeId.value) ?? null
);

const currentTheme = computed<PaperTheme>(() => {
  if (state.value === 'create') {
    return getPaperTheme(editColor.value);
  }
  if (active.value) {
    return getPaperTheme(active.value.color || active.value.category || 'pink');
  }
  return NOTY_PALETTE[1]; // Pink
});

function getRowTheme(t: Todo): PaperTheme {
  return getPaperTheme(t.color || t.category || 'pink');
}

function paperStyle(theme: PaperTheme): StyleValue {
  return {
    backgroundColor: theme.bg,
    color: '#1E293B',
  };
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
function applyRect(r: DockRectP) {
  currentRect = r;
  invoke('apply_dock_geometry', {
    x: r.xP,
    y: r.yP,
    width: r.wP,
    height: r.hP,
  }).catch(() => {});
}

async function refreshAnchor(): Promise<DockAnchor> {
  try {
    const a = await invoke<DockAnchor>('get_dock_anchor');
    anchor.value = a;
    return a;
  } catch (e) {
    console.error('get_dock_anchor failed:', e);
    if (anchor.value) return anchor.value;
    throw e;
  }
}

function tweenTo(target: DockRectP): Promise<void> {
  return new Promise((resolve) => {
    if (raf) cancelAnimationFrame(raf);
    const from =
      currentRect ?? dockLayout(anchor.value!, state.value, rows.value.length, activeIndex.value);
    const t0 = performance.now();
    const step = (ts: number) => {
      const k = Math.min(1, (ts - t0) / SNAP_MS);
      const e = 1 - Math.pow(1 - k, 4);
      const wP = Math.round(from.wP + (target.wP - from.wP) * e);
      const hP = Math.round(from.hP + (target.hP - from.hP) * e);
      const yP = Math.round(from.yP + (target.yP - from.yP) * e);
      const xP = target.rightPhys - wP;
      applyRect({ xP, yP, wP, hP, rightPhys: target.rightPhys });
      if (k < 1) raf = requestAnimationFrame(step);
      else resolve();
    };
    raf = requestAnimationFrame(step);
  });
}

async function goState(next: DockState, pickId?: string | null) {
  const prevId = activeId.value;
  if (pickId !== undefined) {
    activeId.value = pickId ?? null;
    if (active.value) {
      editTitle.value = active.value.title || '';
      editDescription.value = active.value.description || '';
      editColor.value = active.value.color || active.value.category || 'pink';
      saveStatusText.value = 'Saved · just now';
    }
  }

  if (next === 'create') {
    editTitle.value = '';
    editDescription.value = '';
    editColor.value = 'pink';
    saveStatusText.value = 'New Note';
  }

  if (state.value === next && next !== 'open' && prevId === activeId.value) return;
  if (next === 'open' && !active.value) return;

  const prev = state.value;
  state.value = next;

  if (prev !== next || (next === 'open' && prevId !== activeId.value)) {
    const a = await refreshAnchor();
    const rect = dockLayout(a, next, rows.value.length, activeIndex.value);
    await tweenTo(rect);
  }
}

function transition(next: DockState, pickId?: string | null) {
  void goState(next, pickId);
}

// Sizes the OS window so it shows only the always-on color dock column (idle pose).
async function snapIdle() {
  const a = await refreshAnchor();
  const rect = dockLayout(a, 'idle', rows.value.length);
  applyRect(rect);
}

// ---------------------------------------------------------------------------
// Pointer / Idle
// ---------------------------------------------------------------------------
function armCollapse() {
  if (idleTimer) clearTimeout(idleTimer);
  if (state.value === 'create') return;
  // Nothing visible to collapse from idle — the color column is permanent.
  if (state.value === 'idle') return;
  idleTimer = setTimeout(() => {
    if (state.value !== 'idle') transition('idle');
  }, OPEN_IDLE_MS);
}

function pokeClock() {
  now.value = new Date();
}

function handlePointerEnter() {
  pokeClock();
  // No hover-to-open: the color dock is always present. Just keep an open sheet alive.
  if (state.value !== 'idle') armCollapse();
}

function handlePointerMove() {
  pokeClock();
  if (state.value !== 'idle') armCollapse();
}

function handlePointerLeave() {
  if (state.value !== 'idle') armCollapse();
}

function openTask(t: Todo) {
  transition('open', t.id);
}

// ---------------------------------------------------------------------------
// Note Editing & Auto-Save
// ---------------------------------------------------------------------------
function selectColor(colorId: string) {
  editColor.value = colorId;
  if (state.value === 'open' && active.value) {
    active.value.color = colorId;
    triggerAutoSave();
  }
}

function triggerAutoSave() {
  saveStatusText.value = 'Saving…';
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(async () => {
    if (state.value === 'open' && active.value) {
      active.value.title = editTitle.value.trim() || '无标题便笺';
      active.value.description = editDescription.value;
      active.value.color = editColor.value;
      await saveTodos();
      emit(EVENTS.todosChanged, { source: 'sticky' }).catch(() => {});
      saveStatusText.value = 'Saved · just now';
    }
  }, 350);
}

function startCreate() {
  transition('create');
  nextTick(() => {
    titleInputRef.value?.focus();
  });
}

function cancelCreate() {
  transition('idle');
}

async function saveNewNote() {
  const title = editTitle.value.trim();
  if (!title) return;

  const id = Date.now().toString();
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');

  const newTodo: Todo = {
    id,
    title,
    description: editDescription.value.trim() || undefined,
    color: editColor.value,
    category: editColor.value,
    completed: false,
    startTime: d.toISOString(),
    timeText: `${hh}:${min}`,
  };

  todos.value.unshift(newTodo);
  await saveTodos();

  emit(EVENTS.todosChanged, { source: 'sticky' }).catch(() => {});
  activeId.value = id;
  transition('open', id);
}

async function toggleDone(t: Todo, event?: Event) {
  if (event) event.stopPropagation();
  const completed = !t.completed;
  t.completed = completed;
  if (completed) t.completedAt = toYYYYMMDD(new Date());
  else delete t.completedAt;
  await saveTodos();
  loadFromDisk(false).catch(() => {});
  emit(EVENTS.todosChanged, { source: 'sticky' }).catch(() => {});
  armCollapse();
}

async function deleteTask(t: Todo) {
  todos.value = todos.value.filter((item) => item.id !== t.id);
  await saveTodos();
  emit(EVENTS.todosChanged, { source: 'sticky' }).catch(() => {});
  activeId.value = null;
  transition('idle');
}

function openInApp(taskId?: string) {
  if (!taskId) return;
  emit(EVENTS.jumpToTask, { taskId }).catch(() => {});
}

async function hideSticky() {
  try {
    await invoke('set_sticky_visible', { visible: false });
  } catch (e) {
    console.warn('Failed to hide sticky window:', e);
  }
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (state.value === 'create' || state.value === 'open') {
      transition('idle');
    }
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
const saveTodos = async () => {
  try {
    await invoke('save_todos', { data: JSON.stringify(todos.value) });
  } catch (e) {
    console.error('Failed to save todos:', e);
  }
};

const loadFromDisk = async (first = false) => {
  pokeClock();
  try {
    const data: string = await invoke('load_todos');
    todos.value = JSON.parse(Array.isArray(data) ? JSON.stringify(data) : data || '[]');
  } catch (e) {
    console.error('Failed to load todos:', e);
    todos.value = [];
  } finally {
    loading.value = false;
  }
  if (rows.value.length === 0) {
    if (state.value === 'open') {
      activeId.value = null;
      transition('idle');
    }
  } else if (state.value === 'open' && activeId.value && !rows.value.some((r) => r.id === activeId.value)) {
    activeId.value = null;
    transition('idle');
  }
  void first;
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
onMounted(async () => {
  await initTheme();
  isDark.value = document.documentElement.classList.contains('dark');
  await refreshAnchor();
  await loadFromDisk(true);
  await snapIdle();

  window.addEventListener('keydown', handleGlobalKeydown);

  try {
    unlistenTodos = await listen<TodosChangedPayload>(
      EVENTS.todosChanged,
      (ev) => {
        const p = ev?.payload;
        if (!p || p.source === 'sticky') return;
        loadFromDisk(false);
      },
    );
  } catch (e) {
    console.warn('Failed to listen todos-changed:', e);
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
  if (idleTimer) clearTimeout(idleTimer);
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  if (raf) cancelAnimationFrame(raf);
  if (unlistenTodos) unlistenTodos();
});
</script>

<template>
  <div
    class="dock"
    :class="state"
    @pointerenter="handlePointerEnter"
    @pointermove="handlePointerMove"
    @pointerleave="handlePointerLeave"
  >
    <!-- Always-on bookmark tab column pinned to the far-right edge. Each tab = one
         today task bookmark with vertical title text; bottom circle-'+' opens a new note. -->
    <aside class="dock-col">
      <div class="dock-list">
        <button
          v-for="t in visibleRows"
          :key="t.id"
          class="dock-tab"
          :class="{ done: t.completed, active: state === 'open' && activeId === t.id }"
          :style="{ backgroundColor: getRowTheme(t).bg }"
          :title="t.title"
          @click="openTask(t)"
        >
          <span class="dock-tab-title">{{ t.title || '便笺' }}</span>
        </button>

        <div
          v-if="overflowCount > 0"
          class="dock-overflow-badge"
          :title="`还有 ${overflowCount} 个便笺`"
          @click="openInApp(rows[MAX_VISIBLE_TABS]?.id)"
        >
          +{{ overflowCount }}
        </div>
      </div>

      <div class="dock-actions">
        <button
          class="dock-new-btn"
          :class="{ active: state === 'create' }"
          title="新建便笺"
          @click="startCreate"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>

        <button
          class="dock-hide-btn"
          title="收起隐藏便签栏 (可在主窗口桌面便签按钮开启)"
          @click="hideSticky"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>
    </aside>

    <!-- Note paper sheet: smoothly slides out and unfolds to the left of the dock column -->
    <Transition name="noty-fade-slide">
      <section
        v-if="state === 'open' && active"
        key="open"
        class="noty-sheet open"
        :style="{ '--card-top': `${cardTopPx}px` }"
      >
        <div class="noty-paper-card" :style="paperStyle(currentTheme)">
          <div class="noty-main-area">
            <!-- Header -->
            <div class="noty-header">
              <div class="noty-header-title">{{ active.title }}</div>
              <div class="noty-header-right">
                <span class="noty-saved-status">{{ saveStatusText }}</span>
                <button class="noty-icon-btn" @click="openInApp(active.id)" title="在应用中打开">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Content -->
            <div class="noty-content">
              <input
                v-model="editTitle"
                type="text"
                class="noty-title-input"
                placeholder="便笺标题..."
                @input="triggerAutoSave"
              />
              <textarea
                v-model="editDescription"
                class="noty-body-textarea"
                placeholder="在此写下内容，支持多行与便笺便条..."
                @input="triggerAutoSave"
              ></textarea>
            </div>

            <!-- Bottom toolbar -->
            <div class="noty-bottom-bar">
              <div class="noty-color-chips">
                <button
                  v-for="color in NOTY_PALETTE"
                  :key="color.id"
                  class="color-dot"
                  :class="{ active: (active.color || active.category || 'pink') === color.id }"
                  :style="{ backgroundColor: color.chip }"
                  :title="color.name"
                  @click="selectColor(color.id)"
                >
                  <svg
                    v-if="(active.color || active.category || 'pink') === color.id"
                    width="9" height="9" viewBox="0 0 24 24" fill="none"
                    stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </button>
              </div>

              <div class="noty-action-pills">
                <button class="pill-btn" @click="toggleDone(active)">
                  {{ active.completed ? '已完成' : 'Archive' }}
                </button>
                <button class="pill-btn pill-delete" @click="deleteTask(active)">
                  Delete
                </button>
                <button class="pill-btn" @click="transition('idle')">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        v-else-if="state === 'create'"
        key="create"
        class="noty-sheet create"
        :style="{ '--card-top': `${cardTopPx}px` }"
      >
        <div class="noty-paper-card" :style="paperStyle(currentTheme)">
          <div class="noty-main-area">
            <div class="noty-header">
              <div class="noty-header-title">新便笺</div>
              <div class="noty-header-right">
                <span class="noty-saved-status">New Note</span>
              </div>
            </div>

            <div class="noty-content">
              <input
                ref="titleInputRef"
                v-model="editTitle"
                type="text"
                class="noty-title-input"
                placeholder="便笺标题..."
                @keyup.enter="descTextareaRef?.focus()"
              />
              <textarea
                ref="descTextareaRef"
                v-model="editDescription"
                class="noty-body-textarea"
                placeholder="记录便笺详情..."
              ></textarea>
            </div>

            <div class="noty-bottom-bar">
              <div class="noty-color-chips">
                <button
                  v-for="color in NOTY_PALETTE"
                  :key="color.id"
                  class="color-dot"
                  :class="{ active: editColor === color.id }"
                  :style="{ backgroundColor: color.chip }"
                  :title="color.name"
                  @click="editColor = color.id"
                >
                  <svg
                    v-if="editColor === color.id"
                    width="9" height="9" viewBox="0 0 24 24" fill="none"
                    stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </button>
              </div>

              <div class="noty-action-pills">
                <button class="pill-btn pill-save" :disabled="!editTitle.trim()" @click="saveNewNote">
                  保存便笺
                </button>
                <button class="pill-btn" @click="cancelCreate">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Transition>
  </div>
</template>
