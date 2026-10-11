import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTINUE_LIMIT,
  continueTargets,
  matchStores,
  showIntro,
  storeLabel,
  touchRecent,
} from "../src/browse/home-state";
import type { Merchant } from "../src/merchants/merchants-api";

const store = (name: string, domain: string): Merchant => ({
  id: domain,
  name,
  homeUrl: `https://www.${domain}/`,
  logoUrl: null,
  domains: [domain],
});
const merchants = [
  store("Best Buy Canada", "bestbuy.ca"),
  store("Walmart Canada", "walmart.ca"),
  store("Sephora", "sephora.com"),
];

test("a store's short name drops the trailing Canada only", () => {
  assert.equal(storeLabel("Best Buy Canada"), "Best Buy");
  assert.equal(storeLabel("Canadian Tire"), "Canadian Tire");
});

test("the store search matches names and domains, ignoring case and spaces", () => {
  assert.deepEqual(matchStores(merchants, ""), merchants);
  assert.deepEqual(matchStores(merchants, "   "), merchants);
  assert.deepEqual(
    matchStores(merchants, " best ").map((m) => m.id),
    ["bestbuy.ca"],
  );
  assert.deepEqual(
    matchStores(merchants, "WALMART.CA").map((m) => m.id),
    ["walmart.ca"],
  );
  // "Canada" is not part of the shown name, so it does not match every Canadian store.
  assert.deepEqual(matchStores(merchants, "canada"), []);
});

test("continue shopping offers the most recently opened tabs, at most two", () => {
  const tabs = merchants.map((m) => ({ name: m.name, url: m.homeUrl }));
  let recent: string[] = [];
  for (const tab of tabs) recent = touchRecent(recent, tab.url);
  // Reopening a tab moves it to the front without duplicating it.
  recent = touchRecent(recent, tabs[0].url);
  assert.deepEqual(recent, [tabs[0].url, tabs[2].url, tabs[1].url]);
  assert.equal(CONTINUE_LIMIT, 2);
  assert.deepEqual(continueTargets(tabs, recent), [tabs[0], tabs[2]]);
  // A recent store without an open tab is skipped; no tabs, nothing to resume.
  assert.deepEqual(continueTargets([tabs[1]], recent), [tabs[1]]);
  assert.deepEqual(continueTargets([], recent), []);
});

test("the intro shows on an empty cart until dismissed, and never before both are loaded", () => {
  const base = {
    cartReady: true,
    cartCount: 0,
    dismissedReady: true,
    dismissed: false,
  };
  assert.equal(showIntro(base), true);
  assert.equal(showIntro({ ...base, cartCount: 1 }), false);
  assert.equal(showIntro({ ...base, dismissed: true }), false);
  assert.equal(showIntro({ ...base, cartReady: false }), false);
  assert.equal(showIntro({ ...base, dismissedReady: false }), false);
});
