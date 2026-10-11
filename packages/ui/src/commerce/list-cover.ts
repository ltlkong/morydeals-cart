/** How a list's cover is drawn from its newest product images (newest first). */
export type CoverTiles =
  | { kind: "empty" }
  | { kind: "single"; image: string }
  | { kind: "mosaic"; cells: (string | null)[] };

export function coverTiles(images: readonly string[]): CoverTiles {
  if (!images.length) return { kind: "empty" };
  if (images.length === 1) return { kind: "single", image: images[0]! };
  // Missing cells stay blank rather than repeating an image.
  return {
    kind: "mosaic",
    cells: Array.from({ length: 4 }, (_, index) => images[index] ?? null),
  };
}
