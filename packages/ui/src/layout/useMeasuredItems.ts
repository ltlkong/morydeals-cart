import { useEffect, useReducer, useRef } from "react";
import { Image } from "react-native";
import {
  IMAGE_RATIO_FALLBACK,
  createImageSizeCache,
  imageRatio,
  settledPrefix,
  type ImageSize,
} from "./image-ratio";

/** Image.getSize on native and web (react-native-web loads the image and reads its natural size). */
const sizes = createImageSizeCache({
  measure: (url) =>
    new Promise<ImageSize>((resolve, reject) =>
      Image.getSize(
        url,
        (width, height) => resolve({ width, height }),
        (error) => reject(error),
      ),
    ),
});

/**
 * The items a masonry may show now, and each one's image ratio (height / width). Items appear in order once their
 * image is measured (or has no URL, fails or times out, which gives the fallback ratio); `measuring` is true while
 * later items wait. A shown item's ratio never changes, so a card never resizes after it appears.
 */
export function useMeasuredItems<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  imageOf: (item: T) => string | undefined,
) {
  const [, measured] = useReducer((n: number) => n + 1, 0);
  // Ratios of the items already shown, frozen for this masonry.
  const shown = useRef(new Map<string, number>());
  useEffect(() => {
    let live = true;
    for (const item of items) {
      const url = imageOf(item);
      if (
        url &&
        sizes.peek(url) === undefined &&
        !shown.current.has(keyOf(item))
      )
        void sizes.get(url).then(() => {
          if (live) measured();
        });
    }
    return () => {
      live = false;
    };
    // keyOf and imageOf are read for these items only; a new function identity alone needs no new requests.
  }, [items]);
  const count = settledPrefix(items, (item) => {
    const url = imageOf(item);
    return (
      !url || shown.current.has(keyOf(item)) || sizes.peek(url) !== undefined
    );
  });
  const ready = items.slice(0, count);
  for (const item of ready) {
    const key = keyOf(item);
    if (!shown.current.has(key)) {
      const url = imageOf(item);
      shown.current.set(key, imageRatio(url ? sizes.peek(url) : null));
    }
  }
  return {
    ready,
    ratioOf: (item: T) =>
      shown.current.get(keyOf(item)) ?? IMAGE_RATIO_FALLBACK,
    measuring: count < items.length,
  };
}
