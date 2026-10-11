import { test } from "node:test";
import assert from "node:assert/strict";
import { withMembership } from "../src/lists/list-state";

const lists = [
  {
    id: "a",
    name: "Kitchen",
    itemCount: 2,
    covers: [],
    updatedAt: "",
    contains: false,
  },
  {
    id: "b",
    name: "Gifts",
    itemCount: 1,
    covers: [],
    updatedAt: "",
    contains: true,
  },
];

test("ticking a list in the picker updates its mark and count at once; ticking twice is a no-op", () => {
  const added = withMembership(lists, "a", true);
  assert.deepEqual(
    added.map((l) => [l.id, l.contains, l.itemCount]),
    [
      ["a", true, 3],
      ["b", true, 1],
    ],
  );
  assert.deepEqual(withMembership(added, "a", true), added);
  const removed = withMembership(lists, "b", false);
  assert.deepEqual(
    removed.map((l) => [l.id, l.contains, l.itemCount]),
    [
      ["a", false, 2],
      ["b", false, 0],
    ],
  );
  // Undoing a failed change restores the original.
  assert.deepEqual(withMembership(added, "a", false), lists);
});
