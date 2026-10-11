export type DockSnap = 0 | 1 | 2;
export const DOCK_SETTLE_MS = 220;
export const DOCK_MERGE = 48;
/** Height of the drag handle row above the input bar. */
export const GRAB_HEIGHT = 18;
/** Measured fixed areas never include the animated thread or page action line. */
export function dockPoints(
  availableHeight: number,
  base: number,
  keyboard: number,
): readonly [number, number, number] {
  const full = Math.max(0, availableHeight - keyboard - base);
  // Typing has no half anchor: the dock is folded or fully open above the keyboard.
  if (keyboard > 0) return [0, full, full];
  return [0, Math.min(full, Math.max(220, availableHeight * 0.5 - base)), full];
}
/** How many raised anchors (half, full) the dock has reached; a change means a drag just crossed one. */
export function dockLevel(
  height: number,
  points: readonly [number, number, number],
): number {
  return points.slice(1).filter((point) => point > 0 && height >= point).length;
}
export function nearestDockSnap(
  height: number,
  velocityY: number,
  points: readonly number[],
): DockSnap {
  const aim = height - velocityY * 0.15;
  let nearest = 0;
  for (let i = 1; i < points.length; i++)
    if (Math.abs(points[i]! - aim) < Math.abs(points[nearest]! - aim))
      nearest = i;
  return nearest as DockSnap;
}
