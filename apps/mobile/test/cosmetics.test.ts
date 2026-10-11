import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cosmeticStyles,
  cosmeticScript,
  cosmeticStyleScript,
  earlyCosmeticScript,
  GUARD_READY_MESSAGE,
} from "../src/merchants/filtering/cosmetics";
const none = { ids: [], classes: [], hrefs: [] };
test("Ghostery matches Amazon notice rules without leaking them to another host", () => {
  assert.match(cosmeticStyles("https://www.amazon.ca/", none), /#sp-cc/);
  assert.doesNotMatch(cosmeticStyles("https://example.org/", none), /#sp-cc/);
});
test("generic consent banners found in the page are hidden on any store", () => {
  const page = {
    ids: ["onetrust-banner-sdk"],
    classes: ["cookie-consent"],
    hrefs: [],
  };
  const css = cosmeticStyles("https://shop.example/", page);
  assert.match(css, /#onetrust-banner-sdk/);
  assert.match(css, /\.cookie-consent/);
  // Generic rules apply only to elements the page actually has.
  assert.doesNotMatch(
    cosmeticStyles("https://shop.example/", none),
    /#onetrust-banner-sdk/,
  );
});
test("injection is host guarded and reports page elements for matching", () => {
  const script = cosmeticScript("https://www.amazon.ca/");
  assert.match(script, /location.hostname !== "www.amazon.ca"/);
  assert.match(script, /mory-cosmetic-dom/);
  assert.match(script, /MutationObserver/);
});
test("store rules apply before page content and each style pass confirms the page is guarded", () => {
  const early = earlyCosmeticScript("https://www.amazon.ca/");
  assert.match(early, /#sp-cc/);
  assert.match(early, /location.hostname !== "www.amazon.ca"/);
  const pass = cosmeticStyleScript(
    "https://www.amazon.ca/",
    "#x{display:none}",
  );
  assert.match(pass, new RegExp(GUARD_READY_MESSAGE));
});
