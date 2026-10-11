import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMAGE_RATIO_FALLBACK,
  IMAGE_RATIO_MAX,
  IMAGE_RATIO_MIN,
  createImageSizeCache,
  imageRatio,
  settledPrefix,
  type ImageSize,
} from "../src/layout/image-ratio.ts";

const later = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("an image box follows the image's height / width, within 0.75…1.6", () => {
  assert.equal(imageRatio({ width: 800, height: 800 }), 1);
  assert.equal(imageRatio({ width: 600, height: 900 }), 1.5);
  assert.equal(imageRatio({ width: 1600, height: 900 }), IMAGE_RATIO_MIN);
  assert.equal(imageRatio({ width: 500, height: 2000 }), IMAGE_RATIO_MAX);
});

test("no image, a failed one or a nonsense size gets the cards' old fixed shape", () => {
  assert.equal(imageRatio(null), IMAGE_RATIO_FALLBACK);
  assert.equal(imageRatio(undefined), IMAGE_RATIO_FALLBACK);
  assert.equal(imageRatio({ width: 0, height: 300 }), IMAGE_RATIO_FALLBACK);
  assert.equal(imageRatio({ width: NaN, height: 3 }), IMAGE_RATIO_FALLBACK);
  assert.equal(IMAGE_RATIO_FALLBACK, 0.85);
});

test("cards show in order: a later image that loads first waits for the earlier ones", () => {
  const done = new Set(["b", "c"]);
  const items = ["a", "b", "c", "d"];
  assert.equal(
    settledPrefix(items, (i) => done.has(i)),
    0,
  );
  done.add("a");
  assert.equal(
    settledPrefix(items, (i) => done.has(i)),
    3,
  );
  done.add("d");
  assert.equal(
    settledPrefix(items, (i) => done.has(i)),
    4,
  );
  assert.equal(
    settledPrefix([], () => false),
    0,
  );
});

test("each URL is measured once, concurrent callers share it, and the result is kept", async () => {
  const asked: string[] = [];
  const sizes = createImageSizeCache({
    measure: async (url) => {
      asked.push(url);
      return { width: 100, height: 150 };
    },
  });
  assert.equal(sizes.peek("x"), undefined);
  const [one, two] = await Promise.all([sizes.get("x"), sizes.get("x")]);
  assert.deepEqual(one, { width: 100, height: 150 });
  assert.equal(one, two);
  assert.deepEqual(await sizes.get("x"), { width: 100, height: 150 });
  assert.deepEqual(sizes.peek("x"), { width: 100, height: 150 });
  assert.deepEqual(asked, ["x"]);
});

test("at most `concurrency` measurements run at once", async () => {
  let running = 0;
  let most = 0;
  const sizes = createImageSizeCache({
    concurrency: 2,
    measure: async () => {
      running++;
      most = Math.max(most, running);
      await later(5);
      running--;
      return { width: 1, height: 1 };
    },
  });
  await Promise.all(["a", "b", "c", "d", "e"].map((u) => sizes.get(u)));
  assert.equal(most, 2);
});

test("a failed or timed-out image settles as null, and a late size is kept for next time", async () => {
  let release: (size: ImageSize) => void = () => {};
  const sizes = createImageSizeCache({
    timeoutMs: 10,
    measure: (url) =>
      url === "slow"
        ? new Promise<ImageSize>((r) => (release = r))
        : url === "throws"
          ? (() => {
              throw new Error("bad");
            })()
          : Promise.reject(new Error("404")),
  });
  assert.equal(await sizes.get("broken"), null);
  assert.equal(await sizes.get("throws"), null);
  assert.equal(await sizes.get("slow"), null);
  assert.equal(sizes.peek("slow"), null);
  release({ width: 100, height: 200 });
  await later(0);
  assert.deepEqual(sizes.peek("slow"), { width: 100, height: 200 });
});

test("a timed-out measurement frees its slot for the next image", async () => {
  const sizes = createImageSizeCache({
    concurrency: 1,
    timeoutMs: 10,
    measure: (url) =>
      url === "hang"
        ? new Promise<ImageSize>(() => {})
        : Promise.resolve({ width: 2, height: 1 }),
  });
  const hang = sizes.get("hang");
  assert.deepEqual(await sizes.get("next"), { width: 2, height: 1 });
  assert.equal(await hang, null);
});
