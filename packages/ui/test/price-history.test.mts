import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chartGeometry,
  dailyPrices,
  dayAt,
  priceSummary,
} from "../src/data/price-history.ts";

const DAY = 86_400_000;
const now = Date.parse("2026-10-10T12:00:00Z");
const ago = (days: number) => new Date(now - days * DAY).toISOString();

test("one price per day over the window: the last known price carried forward, today the live price", () => {
  const days = dailyPrices(
    [
      { at: ago(3), amountMinor: 5000 },
      { at: ago(1), amountMinor: 4500 },
    ],
    4200,
    now,
    5,
  );
  assert.deepEqual(
    days.map((d) => d.amountMinor),
    [null, 5000, 5000, 4500, 4200],
  );
  assert.equal(days[4]!.day, now);
});

test("a gap (no buy box) holds no price until the next one", () => {
  const days = dailyPrices(
    [
      { at: ago(4), amountMinor: 5000 },
      { at: ago(3), amountMinor: null },
      { at: ago(1), amountMinor: 4800 },
    ],
    4800,
    now,
    5,
  );
  assert.deepEqual(
    days.map((d) => d.amountMinor),
    [5000, null, null, 4800, 4800],
  );
});

test("points out of order or in the future do not change the past", () => {
  const days = dailyPrices(
    [
      { at: ago(1), amountMinor: 4500 },
      { at: ago(3), amountMinor: 5000 },
      { at: ago(-2), amountMinor: 1 },
    ],
    4500,
    now,
    4,
  );
  assert.deepEqual(
    days.map((d) => d.amountMinor),
    [5000, 5000, 4500, 4500],
  );
});

test("the summary names the telling case for today", () => {
  const at = (values: (number | null)[]) =>
    values.map((amountMinor, i) => ({ day: i, amountMinor }));
  assert.equal(priceSummary(at([null, null, 900])).key, "first");
  assert.equal(priceSummary(at([900, 900, 900])).key, "steady");
  assert.equal(priceSummary(at([1000, 1200, 900])).key, "lowest");
  assert.equal(priceSummary(at([1000, 900, 1200])).key, "highest");
  const between = priceSummary(at([1000, 1200, null, 1100]));
  assert.equal(between.key, "between");
  // Low, high and the day-weighted average count tracked days only.
  assert.deepEqual(
    [between.low, between.high, between.average, between.now],
    [1000, 1200, 1100, 1100],
  );
  assert.equal(between.since, 0);
  assert.equal(priceSummary(at([null, null, 900])).since, 2);
});

test("the chart is a step line that breaks at gaps, with the area closed under each run", () => {
  const g = chartGeometry(
    [
      { day: 0, amountMinor: 1000 },
      { day: 1, amountMinor: 1200 },
      { day: 2, amountMinor: null },
      { day: 3, amountMinor: 1100 },
    ],
    { width: 300, height: 100 },
  );
  // Each run starts with a move; a price holds flat until the next day, then jumps.
  assert.equal(g.line.match(/M/g)?.length, 2);
  assert.match(g.line, /^M 0 [\d.]+ H 100 V [\d.]+ H 200/);
  assert.equal(g.area.match(/Z/g)?.length, 2);
  // Higher prices are higher on screen, inside the padded plot.
  assert.ok(g.y(1200) < g.y(1000));
  assert.ok(g.y(1200) > 0 && g.y(1000) < 100);
  assert.equal(g.x(3), 300);
  // The day without a price is a dashed bridge at the last price that joins the line where it resumes.
  assert.equal(g.reference, `M 200 ${g.y(1200)} H 300 V ${g.y(1100)}`);
});

test("a flat history sits mid-plot instead of on an edge", () => {
  const g = chartGeometry(
    [
      { day: 0, amountMinor: 900 },
      { day: 1, amountMinor: 900 },
    ],
    { width: 100, height: 100 },
  );
  assert.equal(Math.round(g.y(900)), 50);
});

test("a finger picks the nearest tracked day, never an untracked one", () => {
  const days = [
    { day: 0, amountMinor: null },
    { day: 1, amountMinor: 1000 },
    { day: 2, amountMinor: 1200 },
  ];
  assert.equal(dayAt(0, days, 200), 1);
  assert.equal(dayAt(190, days, 200), 2);
  assert.equal(dayAt(-50, days, 200), 1);
  assert.equal(dayAt(500, days, 200), 2);
});

test("days before tracking began show as a dashed reference at the first price, joining the line", () => {
  const g = chartGeometry(
    [
      { day: 0, amountMinor: null },
      { day: 1, amountMinor: null },
      { day: 2, amountMinor: 900 },
    ],
    { width: 200, height: 100 },
  );
  assert.equal(g.reference, `M 0 ${g.y(900)} H 200`);
  // A history tracked from its first day has no reference.
  assert.equal(
    chartGeometry(
      [
        { day: 0, amountMinor: 900 },
        { day: 1, amountMinor: 800 },
      ],
      { width: 100, height: 100 },
    ).reference,
    "",
  );
});

test("the window is the last 30 days, one entry per day", async () => {
  const { HISTORY_DAYS } = await import("../src/data/price-history.ts");
  assert.equal(HISTORY_DAYS, 30);
  assert.equal(dailyPrices([], 900, now).length, 30);
});

test("the mini chart: solid where there is a price, dashed where there is none, its end dot inside the frame", async () => {
  const { sparkLayout } = await import("../src/data/price-history.ts");
  const days = [
    { day: 0, amountMinor: null },
    { day: 1, amountMinor: 1200 },
    { day: 2, amountMinor: null },
    { day: 3, amountMinor: 1000 },
  ];
  const spark = sparkLayout(days, { width: 44, height: 14, dot: 2.5 });
  assert.ok(spark.line.length > 0);
  assert.equal(spark.reference.match(/M/g)?.length, 2);
  // The dot (today) is drawn whole: its edge stays inside the frame.
  assert.ok(spark.dot.x + 2.5 <= 44 && spark.dot.x - 2.5 >= 0);
  assert.ok(spark.dot.y + 2.5 <= 14 && spark.dot.y - 2.5 >= 0);
});
