import { test } from "node:test";
import assert from "node:assert/strict";
import { atLeast } from "../src/lib/at-least.ts";

test("a fast reload still settles only after the minimum time", async () => {
  const start = Date.now();
  await atLeast(Promise.resolve("done"), 60);
  assert.ok(Date.now() - start >= 55);
});

test("a slow reload is not delayed further, and a failed reload still settles", async () => {
  const start = Date.now();
  await atLeast(new Promise((resolve) => setTimeout(resolve, 80)), 20);
  assert.ok(Date.now() - start < 150);
  await assert.doesNotReject(atLeast(Promise.reject(new Error("offline")), 10));
});
