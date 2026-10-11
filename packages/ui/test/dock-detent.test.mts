import { test } from "node:test";
import assert from "node:assert/strict";
import { dockLevel, dockPoints } from "../src/chat/dock-geometry.ts";
import { scatter } from "../src/lib/scatter.ts";

test("dock level changes exactly when a drag crosses the half or full anchor", () => {
  const points = dockPoints(620, 96, 0); // [0, 220, 524]
  assert.deepEqual(
    [0, 219, 220, 523, 524].map((height) => dockLevel(height, points)),
    [0, 0, 1, 1, 2],
  );
});

test("dock level never counts a collapsed anchor as reached", () => {
  // Without room for half or full, both anchors are 0 and nothing can be crossed.
  assert.equal(dockLevel(0, dockPoints(280, 96, 200)), 0);
});

test("scatter is deterministic per seed and stays inside the area", () => {
  const options = {
    width: 400,
    height: 800,
    count: 12,
    minSize: 44,
    maxSize: 104,
    maxRotation: 18,
    jitter: 0.7,
    variants: 3,
  };
  const first = scatter({ ...options, seed: "cart" });
  assert.deepEqual(scatter({ ...options, seed: "cart" }), first);
  assert.notDeepEqual(scatter({ ...options, seed: "lists" }), first);
  assert.equal(first.length, 12);
  for (const item of first) {
    assert.ok(item.x >= 0 && item.x <= 400 && item.y >= 0 && item.y <= 800);
    assert.ok(
      item.size >= 44 && item.size <= 104 && Math.abs(item.rotation) <= 18,
    );
    assert.ok(
      Number.isInteger(item.variant) && item.variant >= 0 && item.variant < 3,
    );
  }
});
