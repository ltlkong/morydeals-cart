/** Shared by web and native worklets; progress is normalized to one stroke. */
export function strikeAt(p: number): number {
  "worklet";
  if (p < 0 || p >= 1) return 0;
  if (p < 0.35) return -18 * Math.sin((p / 0.35) * (Math.PI / 2));
  if (p < 0.55) return -18 + 23 * ((p - 0.35) / 0.2);
  return 5 * (1 - (p - 0.55) / 0.45);
}
export function keyLightAt(p: number): number {
  "worklet";
  return p < 0.5 || p >= 1 ? 0 : 0.9 * (1 - (p - 0.5) / 0.5);
}
