import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PILL_SPRING,
  TAB_STEP,
  TAB_WIDTH,
  pillCoverage,
  pillLeftFor,
  tabIndexAt,
  tabRowWidth,
} from "../src/navigation/tab-bar/geometry.ts";

test("tabs sit on a fixed pitch and the pill lands exactly on each one", () => {
  assert.equal(tabRowWidth(4), 4 * TAB_WIDTH + 3 * (TAB_STEP - TAB_WIDTH));
  assert.equal(pillLeftFor(0), 0);
  assert.equal(pillLeftFor(3), 3 * TAB_STEP);
});

test("a finger anywhere over the row picks the tab under it, clamped to the ends", () => {
  assert.equal(tabIndexAt(-20, 4), 0);
  assert.equal(tabIndexAt(TAB_WIDTH / 2, 4), 0);
  assert.equal(tabIndexAt(TAB_STEP + TAB_WIDTH / 2, 4), 1);
  assert.equal(tabIndexAt(10_000, 4), 3);
});

test("a tab is fully coloured only under the pill and fades out over most of one pitch", () => {
  assert.equal(pillCoverage(1, pillLeftFor(1)), 1);
  assert.equal(pillCoverage(0, pillLeftFor(1)), 0);
  const halfway = pillCoverage(1, (pillLeftFor(0) + pillLeftFor(1)) / 2);
  assert.ok(halfway > 0 && halfway < 1);
});

test("the pill spring is critically damped, so it never overshoots into the next tab", () => {
  assert.equal(
    Number(
      (PILL_SPRING.damping / (2 * Math.sqrt(PILL_SPRING.stiffness))).toFixed(2),
    ),
    1,
  );
});

test("scrolling down past the top compacts the bar, and only a tap expands it again", async () => {
  const { scrollCompaction, expandedAt } =
    await import("../src/navigation/tab-bar/geometry.ts");
  const run = (ys: number[], from = { anchor: 0, compact: false }) => {
    let state = from;
    const seen: boolean[] = [];
    for (const y of ys) {
      state = scrollCompaction(state, y);
      seen.push(state.compact);
    }
    return seen;
  };
  // Near the top the bar stays full; past it, a little travel down compacts it.
  assert.deepEqual(run([10, 30, 40, 50, 70]), [
    false,
    false,
    false,
    false,
    true,
  ]);
  // Scrolling back up, even to the top, keeps it compact.
  assert.deepEqual(run([60, 200, 120, 20, 0]), [true, true, true, true, true]);
  // A tap expands it where the page is; scrolling on down compacts it again after some travel.
  assert.deepEqual(run([405, 410, 430], expandedAt(400)), [false, false, true]);
  // An expanded bar scrolled up stays expanded.
  assert.deepEqual(run([380, 300, 290], expandedAt(400)), [
    false,
    false,
    false,
  ]);
});
