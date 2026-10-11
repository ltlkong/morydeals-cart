/**
 * Floating tab bar geometry and motion constants. Free of native imports so it runs under node tests; the
 * functions are worklets so the gesture and the pill can call them on the UI thread.
 */

export const TAB_WIDTH = 68;
export const TAB_HEIGHT = 48;
/** Icons only, while the page scrolls down. */
export const TAB_HEIGHT_COMPACT = 34;
const TAB_GAP = 4;
export const TAB_STEP = TAB_WIDTH + TAB_GAP;
export const DRAG_THRESHOLD_PX = 8;
export const PILL_DRAG_SCALE = 1.12;
export const PRESS_SCALE = 0.88;
export const PRESS_MS = 80;

/**
 * Critically damped (damping / 2√stiffness = 1): the pill arrives without overshooting into the next tab. Rest is
 * "visually arrived" (within 4px, under 100px/s) instead of Reanimated's near-zero defaults, which would leave a
 * long, invisible tail before the landing reports back.
 */
export const PILL_SPRING = {
  damping: 43,
  stiffness: 462.25,
  restDisplacementThreshold: 4,
  restSpeedThreshold: 100,
} as const;

export function tabRowWidth(count: number): number {
  "worklet";
  return count * TAB_WIDTH + Math.max(0, count - 1) * TAB_GAP;
}

export function pillLeftFor(index: number): number {
  "worklet";
  return index * TAB_STEP;
}

/** The tab under a finger at `x` (row coordinates), clamped to the first and last tab. */
export function tabIndexAt(x: number, count: number): number {
  "worklet";
  return Math.min(Math.max(Math.floor(x / TAB_STEP), 0), count - 1);
}

/** How far a tab's colour reaches, in pitches. */
const COVERAGE_FALLOFF = 0.8;
/** The crossfade window, so both colour copies are not half-visible for most of the travel. */
export const COVERAGE_FADE = [0.3, 0.7] as const;

/** 1 when the pill sits on the tab, falling to 0 one falloff away: the colour follows the pill continuously. */
export function pillCoverage(index: number, pillLeft: number): number {
  "worklet";
  const distance = Math.abs(pillLeftFor(index) - pillLeft);
  return Math.min(Math.max(1 - distance / (TAB_STEP * COVERAGE_FALLOFF), 0), 1);
}

/** Above this scroll offset scrolling does not compact the bar. */
const COMPACT_FROM = 48;
/** Travel down before the bar compacts, so a jitter does not flicker it. */
const COMPACT_TRAVEL = 16;
export type ScrollCompaction = { anchor: number; compact: boolean };

/**
 * The bar compacts once the page has scrolled down far enough and stays compact while scrolling either way; only a
 * tap expands it (`expandedAt`). While expanded, `anchor` is the highest point since, so it compacts after
 * COMPACT_TRAVEL of further travel down.
 */
export function scrollCompaction(
  state: ScrollCompaction,
  y: number,
): ScrollCompaction {
  "worklet";
  if (state.compact) return { anchor: y, compact: true };
  // Travel is counted from where the page leaves the top.
  if (y < COMPACT_FROM) return { anchor: y, compact: false };
  if (y > state.anchor + COMPACT_TRAVEL && y > state.anchor + COMPACT_TRAVEL)
    return { anchor: y, compact: true };
  return { anchor: Math.min(state.anchor, y), compact: false };
}

/** The state after a tap expands the bar with the page at `y`. */
export function expandedAt(y: number): ScrollCompaction {
  "worklet";
  return { anchor: y, compact: false };
}
