import { test } from "node:test";
import assert from "node:assert/strict";
import { validMoryLook } from "../src/account/mory-look-parts";

test("only a known headpiece and expression are accepted from storage", () => {
  assert.equal(validMoryLook({ headpiece: "pear", expression: "wink" }), true);
  assert.equal(
    validMoryLook({ headpiece: "none", expression: "neutral" }),
    true,
  );
  assert.equal(
    validMoryLook({ headpiece: "cherry", expression: "starry" }),
    true,
  );
  assert.equal(
    validMoryLook({ headpiece: "lemon", expression: "happy" }),
    true,
  );
  for (const value of [
    null,
    {},
    { headpiece: "banana", expression: "wink" },
    { headpiece: "pear", expression: 3 },
    // A scene-only expression is never a saved everyday look.
    { headpiece: "pear", expression: "worried" },
    "pear",
  ])
    assert.equal(validMoryLook(value), false, JSON.stringify(value));
});
