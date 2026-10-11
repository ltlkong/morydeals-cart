/** Platform-neutral pose motion. Worklet directives keep these usable on the native UI thread. */
export function bobAt(t: number): number {
  "worklet";
  return 0.5 - 0.5 * Math.cos(t * Math.PI * 4);
}

export function leafAngle(t: number): number {
  "worklet";
  return 6 * Math.sin(t * Math.PI * 4);
}

export function blinkAt(t: number): number {
  "worklet";
  if (t < 0.86 || t > 0.94) return 1;
  return t < 0.9
    ? 1 - ((t - 0.86) / 0.04) * 0.9
    : 0.1 + ((t - 0.9) / 0.04) * 0.9;
}

export function glanceAt(t: number): number {
  "worklet";
  return 4 * Math.sin(t * Math.PI * 2);
}

export function heldAngle(t: number): number {
  "worklet";
  return 5 * Math.sin(t * Math.PI * 2);
}

export function waveAngle(t: number): number {
  "worklet";
  return t < 0.5 ? 22 * Math.sin(t * Math.PI * 12) : 0;
}

/** A bell's ring: a quick decaying swing in the first third of the turn, then still. */
export function ringAngle(t: number): number {
  "worklet";
  if (t >= 0.32) return 0;
  return 14 * (1 - t / 0.32) * Math.sin(t * Math.PI * 25);
}

/** Two small hops early in the turn (0 at rest, 1 at the top of a hop). */
export function hopAt(t: number): number {
  "worklet";
  if (t >= 0.4) return 0;
  return Math.abs(Math.sin((t / 0.4) * Math.PI * 2));
}
