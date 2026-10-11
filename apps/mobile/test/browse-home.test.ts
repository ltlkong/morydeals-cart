import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECENTLY_VIEWED_LIMIT,
  matchStores,
  merchantOf,
  openTabs,
  recentlyViewed,
  showIntro,
  storeLabel,
  storeTiles,
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

test("open tabs come back the most recently opened first", () => {
  const tabs = merchants.map((m) => ({ name: m.name, url: m.homeUrl }));
  let recent: string[] = [];
  for (const tab of tabs) recent = touchRecent(recent, tab.url);
  // Reopening a tab moves it to the front without duplicating it.
  recent = touchRecent(recent, tabs[0].url);
  assert.deepEqual(recent, [tabs[0].url, tabs[2].url, tabs[1].url]);
  assert.deepEqual(openTabs(tabs, recent), [tabs[0], tabs[2], tabs[1]]);
  // A recent store without an open tab is skipped.
  assert.deepEqual(openTabs([tabs[1]], recent), [tabs[1]]);
  assert.deepEqual(openTabs([], recent), []);
});

const many = [
  ...merchants,
  store("Costco Canada", "costco.ca"),
  store("Canadian Tire", "canadiantire.ca"),
  store("IKEA Canada", "ikea.com"),
  store("Simons", "simons.ca"),
];
const keys = (r: ReturnType<typeof storeTiles>) =>
  r.tiles.map((t) => `${t.key}${t.resume ? "*" : ""}`);

test("a page belongs to the store whose domain it is on, subdomains included", () => {
  assert.equal(
    merchantOf(many, "https://www.bestbuy.ca/en-ca/product/1")?.id,
    "bestbuy.ca",
  );
  assert.equal(merchantOf(many, "https://sephora.com/")?.id, "sephora.com");
  assert.equal(merchantOf(many, "https://notbestbuy.ca/"), undefined);
});

test("stores with an open tab lead the grid, most recent first, and continue that tab", () => {
  const product = { name: "Sephora", url: "https://www.sephora.com/ca/p/1" };
  const home = { name: "Best Buy Canada", url: "https://www.bestbuy.ca/" };
  const older = { name: "Sephora", url: "https://www.sephora.com/" };
  const result = storeTiles({
    merchants: many,
    tabs: [product, home, older],
    query: "",
    collapsed: false,
    allowOthers: true,
  });
  assert.deepEqual(keys(result), [
    "sephora.com*",
    "bestbuy.ca*",
    "walmart.ca",
    "costco.ca",
    "canadiantire.ca",
    "ikea.com",
    "simons.ca",
  ]);
  // A store with several tabs continues the most recent one.
  assert.equal(result.tiles[0].target, product);
  assert.equal(result.tiles[0].name, "Sephora");
  // Other stores open their home page.
  assert.deepEqual(result.tiles[2].target, {
    name: "Walmart Canada",
    url: "https://www.walmart.ca/",
    logoUrl: null,
  });
  assert.equal(result.hidden, 0);
});

test("a tab on a store outside the catalog is promoted under its host", () => {
  const other = { name: "Other store", url: "https://www.muji.ca/sale" };
  const result = storeTiles({
    merchants,
    tabs: [other],
    query: "",
    collapsed: false,
    allowOthers: true,
  });
  assert.deepEqual(keys(result), [
    "muji.ca*",
    "bestbuy.ca",
    "walmart.ca",
    "sephora.com",
  ]);
  assert.equal(result.tiles[0].name, "muji.ca");
});

test("the search filters every store and keeps matching open stores first", () => {
  const tabs = [
    { name: "Canadian Tire", url: "https://www.canadiantire.ca/" },
    { name: "Sephora", url: "https://www.sephora.com/" },
  ];
  const result = storeTiles({
    merchants: many,
    tabs,
    query: "ca",
    collapsed: true,
    allowOthers: true,
  });
  // Collapsing never hides search results; the open Sephora tab does not match and stays out.
  assert.deepEqual(keys(result), [
    "canadiantire.ca*",
    "bestbuy.ca",
    "walmart.ca",
    "costco.ca",
    "simons.ca",
  ]);
  assert.equal(result.hidden, 0);
});

test("collapsed, the grid keeps two rows with Other store last, promoted stores included", () => {
  const tabs = [{ name: "IKEA Canada", url: "https://www.ikea.com/ca/" }];
  const collapsed = storeTiles({
    merchants: many,
    tabs,
    query: "",
    collapsed: true,
    allowOthers: true,
  });
  assert.deepEqual(keys(collapsed), [
    "ikea.com*",
    "bestbuy.ca",
    "walmart.ca",
    "sephora.com",
    "costco.ca",
  ]);
  assert.equal(collapsed.hidden, 2);
  // Without the Other store cell, two full rows.
  const noOthers = storeTiles({
    merchants: many,
    tabs,
    query: "",
    collapsed: true,
    allowOthers: false,
  });
  assert.equal(noOthers.tiles.length, 6);
  assert.equal(noOthers.hidden, 1);
  // A catalog that fits shows nothing hidden.
  const small = storeTiles({
    merchants,
    tabs: [],
    query: "",
    collapsed: true,
    allowOthers: true,
  });
  assert.equal(small.tiles.length, 3);
  assert.equal(small.hidden, 0);
});

test("recently viewed leaves out what is in the cart and keeps the newest few", () => {
  const history = Array.from({ length: 14 }, (_, i) => ({
    url: `https://www.bestbuy.ca/p/${i}`,
  }));
  const shown = recentlyViewed(history, [history[0].url, history[3].url]);
  assert.equal(shown.length, RECENTLY_VIEWED_LIMIT);
  assert.equal(shown[0].url, history[1].url);
  assert.ok(!shown.some((p) => p.url === history[3].url));
  assert.deepEqual(recentlyViewed([], []), []);
  assert.deepEqual(recentlyViewed(history.slice(0, 1), [history[0].url]), []);
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
