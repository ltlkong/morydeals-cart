import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amazonAsin,
  backfillBatchSize,
  buyBoxPoints,
  keepaDate,
} from '../../../src/history/keepa-history.ts';

test('Keepa minutes convert to real time', () => {
  // Keepa time counts minutes from 2011-01-01T00:00:00Z.
  assert.equal(keepaDate(0).toISOString(), '2011-01-01T00:00:00.000Z');
  assert.equal(keepaDate(8294807).toISOString(), '2026-10-09T06:47:00.000Z');
});

test('Buy Box history keeps prices in cents and marks missing ones as gaps', () => {
  // Tail of a real Keepa BUY_BOX_SHIPPING series: [time, price, shipping] triples.
  const points = buyBoxPoints([8275673, 2328, 0, 8287162, -1, -1, 8294807, 1709, 0]);
  assert.deepEqual(
    points.map((p) => [p.observedAt.toISOString(), p.amountMinor, p.shippingMinor]),
    [
      ['2026-09-25T23:53:00.000Z', 2328, 0],
      ['2026-10-03T23:22:00.000Z', null, null],
      ['2026-10-09T06:47:00.000Z', 1709, 0],
    ],
  );
});

test('malformed series are rejected rather than half read', () => {
  assert.throws(() => buyBoxPoints([8275673, 2328]), /Malformed/);
  assert.throws(() => buyBoxPoints([8275673, 23.5, 0]), /Malformed/);
  assert.deepEqual(buyBoxPoints(undefined), []);
});

test('only canonical amazon.ca product URLs map to an ASIN', () => {
  assert.equal(amazonAsin('https://www.amazon.ca/dp/B00MW8G3YU'), 'B00MW8G3YU');
  assert.equal(amazonAsin('https://www.amazon.com/dp/B00MW8G3YU'), undefined);
  assert.equal(amazonAsin('https://www.amazon.ca/s?k=pads'), undefined);
});

test('a run spends at most the minute refill and never more than it has', () => {
  assert.equal(backfillBatchSize(1200, 20, 3), 6);
  assert.equal(backfillBatchSize(7, 20, 3), 2);
  assert.equal(backfillBatchSize(2, 20, 3), 0);
  assert.equal(backfillBatchSize(-50, 20, 3), 0);
});
