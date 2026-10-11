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
