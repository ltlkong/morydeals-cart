import { test } from "node:test";
import assert from "node:assert/strict";
import { priceTrend } from "../src/cart/price-trend";

const now = new Date("2026-10-10T00:00:00Z");
const at = (days: number) =>
  new Date(now.getTime() - days * 86400000).toISOString();

test("the mini chart covers the last 30 days, like the product page, with today's price last", () => {
  const trend = priceTrend([{ at: at(10), amountMinor: 2000 }], 1800, now);
  assert.equal(trend.days.length, 30);
  assert.equal(trend.days.at(-1)!.amountMinor, 1800);
  // Days before the first price have none (drawn dashed).
  assert.equal(trend.days[0]!.amountMinor, null);
});

test("one price is a first price while history builds", () => {
  const trend = priceTrend([], 1709, now);
  assert.equal(trend.state, "steady");
  assert.match(trend.label, /First price recorded/);
});

test("the lowest price in the window is low; a gap holds no price", () => {
  const trend = priceTrend(
    [
      { at: at(25), amountMinor: 2328 },
      { at: at(15), amountMinor: null },
      { at: at(5), amountMinor: 1709 },
    ],
    1709,
    now,
  );
  assert.equal(trend.state, "low");
  assert.match(trend.label, /Lowest price in 30 days/);
  assert.equal(trend.days[30 - 1 - 10]!.amountMinor, null);
});

test("a drop that is not the lowest is a drop; an unchanged price is steady", () => {
  const history = [
    { at: at(25), amountMinor: 1500 },
    { at: at(10), amountMinor: 2500 },
  ];
  assert.equal(priceTrend(history, 2000, now).state, "drop");
  assert.equal(
    priceTrend([{ at: at(20), amountMinor: 2000 }], 2000, now).state,
    "steady",
  );
});
