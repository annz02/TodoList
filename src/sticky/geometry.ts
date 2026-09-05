export type DockState = 'collapsed' | 'idle' | 'open' | 'create';

/** Physical gap (px) between the dock's right edge and the work area's right edge. */
export const EDGE_GAP_PX = 0;
/** Logical width of the collapsed edge handle tab. */
export const COLLAPSED_W = 18;
/** Logical height of the collapsed edge handle tab. */
export const COLLAPSED_H = 68;
/** Logical width of the always-visible bookmark tab column in idle. */
export const DOCK_COL_W = 46;
/** Logical reserved width of the note sheet next to the tab column in open/create. */
export const NOTE_W = 380;
/** Fixed logical height of the open/create note sheet (strictly 250px). */
export const NOTE_PAD_H = 250;
/** Height of a single bookmark note tab. */
export const TAB_H = 92;
/** Vertical overlap (px) between consecutive bookmark tabs. */
export const TAB_OVERLAP = 10;
/** Height of the overflow badge pill (+N). */
export const OVERFLOW_BADGE_H = 28;
/** Height carved out at the bottom of the column for the new note + collapse action buttons. */
export const PLUS_ZONE_H = 72;
/** Vertical top/bottom padding buffer for the dock column. */
export const DOCK_PAD_V = 16;
/** Maximum visible tabs shown in the idle dock strip. */
export const MAX_VISIBLE_TABS = 5;
/** Duration (ms) of the JS rAF tween that reshapes the OS window. */
export const SNAP_MS = 260;

export interface DockAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

/** A physical rect + the pinned right edge (for the tween's keep-edge-left-follows-width). */
export interface DockRectP {
  xP: number;
  yP: number;
  wP: number;
  hP: number;
  rightPhys: number;
}

/**
 * Logical window height: collapsed hugs the mini handle tab; idle hugs the bookmark-tab stack;
 * open/create use a fixed note-sheet height independent of tab count.
 */
export function dockHeightFor(state: DockState, nRows: number, workAreaLogicalH: number, activeIdx: number = 0): number {
  if (state === 'collapsed') {
    return COLLAPSED_H;
  }
  const maxBody = workAreaLogicalH - 2 * 8;
  const visible = Math.min(nRows, MAX_VISIBLE_TABS);
  const stackH =
    visible === 0
      ? 64
      : DOCK_PAD_V +
        TAB_H +
        Math.max(0, visible - 1) * (TAB_H - TAB_OVERLAP) +
        (nRows > MAX_VISIBLE_TABS ? OVERFLOW_BADGE_H + 4 : 0) +
        PLUS_ZONE_H;

  // In open / create state: window height encloses both the note sheet (aligned to active tab top)
  // and the tab stack (stackH) so that neither the right column nor the note card is ever clipped.
  if (state === 'open' || state === 'create') {
    const cardTop = state === 'create'
      ? 8 + Math.min(nRows, MAX_VISIBLE_TABS) * (TAB_H - TAB_OVERLAP)
      : 8 + Math.max(0, activeIdx) * (TAB_H - TAB_OVERLAP);
    const cardBottom = cardTop + NOTE_PAD_H + 16;
    return Math.min(Math.max(stackH, cardBottom), maxBody);
  }
  return Math.min(Math.max(64, stackH), maxBody);
}

export function dockLayout(anchor: DockAnchor, state: DockState, nRows: number, activeIdx: number = 0): DockRectP {
  const s = anchor.scaleFactor || 1;
  const loX = anchor.x / s;
  const loY = anchor.y / s;
  const loW = anchor.width / s;
  const loH = anchor.height / s;

  // Logical width by state: collapsed keeps just the 18px edge handle, idle keeps color column; open/create add a sheet
  // for the note card on the left of that column.
  const wLog =
    state === 'collapsed'
      ? COLLAPSED_W
      : state === 'idle'
      ? DOCK_COL_W
      : Math.min(DOCK_COL_W + NOTE_W, loW);

  // Logical height by state.
  const hLog = dockHeightFor(state, nRows, loH, activeIdx);

  // Pin the window top yP to the idle rest pose top position so the window
  // and the right tabs column NEVER jump or move vertically when opening.
  const idleHLog = dockHeightFor('idle', nRows, loH);
  const cyLog = loY + loH / 2;
  const idleHP = Math.max(1, Math.round(idleHLog * s));
  const yP =
    state === 'collapsed'
      ? Math.max(Math.round(loY * s), Math.round(cyLog * s - Math.round(COLLAPSED_H * s) / 2))
      : Math.max(Math.round(loY * s), Math.round(cyLog * s - idleHP / 2));
  const hP = Math.max(1, Math.round(hLog * s));

  // Physical right edge pinned; left edge follows width.
  const wP = Math.max(1, Math.round(wLog * s));
  const rightPhys = Math.round((loX + loW) * s) - EDGE_GAP_PX;
  const xP = rightPhys - wP;

  return { xP, yP, wP, hP, rightPhys };
}

