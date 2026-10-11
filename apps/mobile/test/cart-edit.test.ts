import { test } from "node:test";
import assert from "node:assert/strict";
import { toggleSelected, selectAll } from "../src/cart/cart-selection";

test("tapping a card in edit mode selects or deselects it; select all flips between all and none", () => {
  const one = toggleSelected(new Set<string>(), "a");
  assert.deepEqual([...one], ["a"]);
  assert.deepEqual([...toggleSelected(one, "a")], []);
  // A new set each time, so React sees the change.
  assert.notEqual(toggleSelected(one, "b"), one);
  const urls = ["a", "b", "c"];
  assert.deepEqual([...selectAll(new Set(["a"]), urls)].sort(), urls);
  assert.deepEqual([...selectAll(new Set(urls), urls)], []);
  // Products that left the cart do not stay selected.
  assert.deepEqual([...selectAll(new Set(["gone"]), urls)].sort(), urls);
});
