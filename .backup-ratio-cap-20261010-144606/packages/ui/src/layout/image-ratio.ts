/**
 * Product images in a masonry: each card's image box follows the image's own shape, measured before the card is
 * shown, so a card never changes height (and the cards below it never move) once it is on screen.
 */
export type ImageSize = { width: number; height: number };

/**
 * Height / width bounds of an image box. 0.75 (4:3 landscape) keeps wide banners from shrinking a card to a sliver
 * of picture over a block of text; 1.6 (a bit taller than 2:3 apparel shots) keeps one tall image from filling
 * a phone screen. Images past a bound are letterboxed in the box, never cropped.
 */
export const IMAGE_RATIO_MIN = 0.75;
export const IMAGE_RATIO_MAX = 1.6;
/** The box when an image has no URL, fails or times out: the cards' previous fixed shape. */
export const IMAGE_RATIO_FALLBACK = 0.85;

const usable = (size: ImageSize | null | undefined): size is ImageSize =>
  !!size &&
  Number.isFinite(size.width) &&
  Number.isFinite(size.height) &&
  size.width > 0 &&
  size.height > 0;

/** The image box's height / width for a measured image (null: unknown or failed). */
export function imageRatio(size: ImageSize | null | undefined): number {
  if (!usable(size)) return IMAGE_RATIO_FALLBACK;
  return Math.min(
    IMAGE_RATIO_MAX,
    Math.max(IMAGE_RATIO_MIN, size.height / size.width),
  );
}

/**
 * How many leading items may be shown: every item up to the first one still measuring. A later image that loads
 * first waits for the earlier ones, so cards appear in their order and are only ever appended.
 */
export function settledPrefix<T>(
  items: readonly T[],
  settled: (item: T) => boolean,
): number {
  const waiting = items.findIndex((item) => !settled(item));
  return waiting === -1 ? items.length : waiting;
}

export type ImageSizeCache = {
  /** The image's size; null if it failed or timed out; undefined while unknown. */
  peek: (url: string) => ImageSize | null | undefined;
  /** Measures once per URL (concurrent callers share the request); never rejects. */
  get: (url: string) => Promise<ImageSize | null>;
};

/**
 * Image sizes by URL, kept for the session. At most `concurrency` measurements run at once; one that takes longer
 * than `timeoutMs` settles as null (the fallback shape). If it still arrives later, the size is kept for the next
 * time the image is shown; a card already on screen keeps its shape.
 */
export function createImageSizeCache({
  measure,
  concurrency = 6,
  timeoutMs = 4000,
}: {
  measure: (url: string) => Promise<ImageSize>;
  concurrency?: number;
  timeoutMs?: number;
}): ImageSizeCache {
  const known = new Map<string, ImageSize | null>();
  const pending = new Map<string, Promise<ImageSize | null>>();
  const queue: (() => void)[] = [];
  let active = 0;
  const pump = () => {
    while (active < concurrency && queue.length) queue.shift()!();
  };
  const run = (url: string, resolve: (size: ImageSize | null) => void) => {
    active++;
    let settled = false;
    const finish = (size: ImageSize | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      active--;
      known.set(url, size);
      pending.delete(url);
      resolve(size);
      pump();
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    let measuring: Promise<ImageSize>;
    try {
      measuring = measure(url);
    } catch {
      measuring = Promise.reject(new Error("measure failed"));
    }
    measuring.then(
      (size) => {
        if (!settled) finish(usable(size) ? size : null);
        else if (usable(size)) known.set(url, size);
      },
      () => finish(null),
    );
  };
  return {
    peek: (url) => known.get(url),
    get(url) {
      if (known.has(url)) return Promise.resolve(known.get(url) ?? null);
      const waiting = pending.get(url);
      if (waiting) return waiting;
      const promise = new Promise<ImageSize | null>((resolve) => {
        queue.push(() => run(url, resolve));
      });
      pending.set(url, promise);
      pump();
      return promise;
    },
  };
}
