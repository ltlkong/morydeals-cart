/** Where an edge swipe may start, from the screen's left edge. */
export const EDGE_WIDTH = 32;
const FLING = 800;
const RECOIL = -300;

/** A swipe back closes when released past a third of the screen or flung right; flinging back left keeps the page. */
export function closesOnRelease(
  translationX: number,
  velocityX: number,
  width: number,
): boolean {
  "worklet";
  if (velocityX < RECOIL) return false;
  return translationX > width / 3 || velocityX > FLING;
}
