/**
 * Deterministic scatter for background decorations: a jittered grid whose every attribute comes from a
 * hash of (seed, index, attribute). No Math.random, so a field never reshuffles on re-render or reload.
 */

export type Scattered = {
  x: number;
  y: number;
  size: number;
  rotation: number;
  variant: number;
};

type Options = {
  width: number;
  height: number;
  count: number;
  seed: string;
  minSize: number;
  maxSize: number;
  /** Degrees either way. */
  maxRotation: number;
  /** 0 is a rigid grid; 1 lets an item wander to its cell's edge. */
  jitter: number;
  variants: number;
};

/** A 32-bit hash of a string, mapped to [0, 1). */
export function unitHash(value: string): number {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  // Final avalanche (murmur3 fmix32) so neighbouring seeds do not produce neighbouring values.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Items spread evenly over the area: columns follow the aspect ratio, each item jittered within its cell. */
export function scatter({
  width,
  height,
  count,
  seed,
  minSize,
  maxSize,
  maxRotation,
  jitter,
  variants,
}: Options): Scattered[] {
  if (width <= 0 || height <= 0 || count <= 0) return [];
  const columns = Math.max(1, Math.round(Math.sqrt((count * width) / height)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const items: Scattered[] = [];
  for (let index = 0; index < columns * rows; index += 1) {
    const at = (attribute: string) => unitHash(`${seed}:${index}:${attribute}`);
    const column = index % columns;
    const row = Math.floor(index / columns);
    // Odd rows shift half a cell so the field never lines up into visible columns.
    const shift = row % 2 === 1 ? cellWidth / 2 : 0;
    items.push({
      x:
        ((column + 0.5) * cellWidth +
          shift +
          (at("x") - 0.5) * cellWidth * jitter) %
        width,
      y: (row + 0.5) * cellHeight + (at("y") - 0.5) * cellHeight * jitter,
      size: minSize + at("size") * (maxSize - minSize),
      rotation: (at("rotation") * 2 - 1) * maxRotation,
      variant: Math.floor(at("variant") * variants),
    });
  }
  return items;
}
