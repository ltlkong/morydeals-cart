import { test } from "node:test";
import assert from "node:assert/strict";
import { masonryColumns } from "../src/layout/masonry-layout.ts";
import { dockPoints, nearestDockSnap } from "../src/chat/dock-geometry.ts";

test("masonry puts a new card into the shortest column and preserves prior assignments", () => {
  const items = [
    { id: "a", height: 300 },
    { id: "b", height: 100 },
    { id: "c", height: 100 },
    { id: "d", height: 400 },
  ];
  const first = masonryColumns(items.slice(0, 3), 2, (item) => item.height, 8);
  const appended = masonryColumns(items, 2, (item) => item.height, 8);
  assert.deepEqual(
    first.map((col) => col.map((item) => item.id)),
    [["a"], ["b", "c"]],
  );
  assert.deepEqual(
    appended.map((col) => col.map((item) => item.id)),
    [["a"], ["b", "c", "d"]],
  );
  assert.equal(appended.flat().length, items.length);
});
test("dock anchors fit the parent with and without a keyboard", () => {
  assert.deepEqual(dockPoints(620, 96, 0), [0, 220, 524]);
  // With the keyboard open there is no half anchor: folded or full only.
  assert.deepEqual(dockPoints(620, 96, 180), [0, 344, 344]);
  assert.deepEqual(dockPoints(280, 96, 200), [0, 0, 0]);
  assert.deepEqual(dockPoints(320, 96, 120), [0, 104, 104]);
});
test("dock chooses the nearest anchor and projects an upward fling", () => {
  const points = dockPoints(620, 96, 0);
  assert.equal(nearestDockSnap(20, 0, points), 0);
  assert.equal(nearestDockSnap(230, 0, points), 1);
  assert.equal(nearestDockSnap(490, 0, points), 2);
  assert.equal(nearestDockSnap(230, -1800, points), 2);
});
