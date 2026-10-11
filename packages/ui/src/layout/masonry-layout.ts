const HEIGHTS = [150, 190, 170, 230, 160, 210] as const;
/** Copied from the previous shopper package; geometry is stable before images load. */
export function imageHeightOf(key: string): number {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return HEIGHTS[hash % HEIGHTS.length]!;
}
export function masonryColumns<T>(
  items: readonly T[],
  count: number,
  heightOf: (item: T) => number,
  gap: number,
): T[][] {
  const columns: T[][] = Array.from(
    { length: Math.max(1, Math.floor(count)) },
    () => [],
  );
  const heights = columns.map(() => 0);
  for (const item of items) {
    const shortest = heights.indexOf(Math.min(...heights));
    columns[shortest]!.push(item);
    heights[shortest]! += Math.max(0, heightOf(item)) + gap;
  }
  return columns;
}
