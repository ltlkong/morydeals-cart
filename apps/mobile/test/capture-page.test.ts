import { test } from "node:test";
import assert from "node:assert/strict";
import { PageSnapshotSchema } from "@morydeals/capture-contracts/snapshot";
import {
  capturePageScript,
  toPageSnapshot,
} from "../src/merchants/capture-page";
const html = "<html><body>Café</body></html>";
test("the snapshot carries only the page; parsing happens on the server", () => {
  const before = Date.now();
  const snapshot = toPageSnapshot(
    { url: "https://shop.example/chair", html },
    "https://shop.example/",
  );
  assert.deepEqual(Object.keys(snapshot).sort(), ["capturedAt", "html", "url"]);
  assert.ok(Date.parse(snapshot.capturedAt) >= before);
  assert.ok(PageSnapshotSchema.safeParse(snapshot).success);
});
test("page-supplied fields are validated", () => {
  assert.throws(
    () => toPageSnapshot({ url: 42, html }, "https://shop.example/"),
    /Could not read this page/,
  );
  assert.throws(
    () =>
      toPageSnapshot(
        { url: "https://other.example/", html },
        "https://shop.example/",
      ),
    /Page changed/,
  );
});
test("size limit counts UTF-8 bytes", () => {
  const large = `<html>${"é".repeat(3 * 1024 * 1024)}</html>`;
  assert.throws(
    () =>
      toPageSnapshot(
        { url: "https://shop.example/", html: large },
        "https://shop.example/",
      ),
    /too large/,
  );
});
test("every page is slimmed before upload, keeping parser data", () => {
  const script = capturePageScript("request-1");
  new Function(script); // valid JavaScript for the WebView
  assert.match(script, /cloneNode\(true\)/);
  assert.match(script, /__INITIAL_STATE__/);
  assert.match(script, /json/);
});
