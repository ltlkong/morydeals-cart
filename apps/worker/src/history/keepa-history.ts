/** Keepa time counts minutes from 2011-01-01T00:00:00Z. */
const KEEPA_EPOCH_MINUTES = 21_564_000;
export const keepaDate = (minutes: number) => new Date((minutes + KEEPA_EPOCH_MINUTES) * 60_000);

export type KeepaPoint = {
  observedAt: Date;
  amountMinor: number | null;
  shippingMinor: number | null;
};
const cents = (value: number) => (value < 0 ? null : value);

/**
 * Keepa's BUY_BOX_SHIPPING series (csv[18]) as points: [time, price, shipping] triples in the domain's minor units;
 * -1 means there was no Buy Box (stored as a gap). Anything else malformed is rejected as a whole.
 */
export function buyBoxPoints(series: unknown): KeepaPoint[] {
  if (series == null) return [];
  if (
    !Array.isArray(series) ||
    series.length % 3 !== 0 ||
    !series.every((value) => Number.isSafeInteger(value))
  )
    throw new Error('Malformed Keepa Buy Box history');
  const points: KeepaPoint[] = [];
  for (let index = 0; index < series.length; index += 3)
    points.push({
      observedAt: keepaDate(series[index]),
      amountMinor: cents(series[index + 1]),
      shippingMinor: cents(series[index + 2]),
    });
  return points;
}

/** The worker stores Amazon products under this one canonical URL shape. */
export function amazonAsin(url: string): string | undefined {
  return /^https:\/\/www\.amazon\.ca\/dp\/([A-Z0-9]{10})$/.exec(url)?.[1];
}

/** Products one run may fetch: within this minute's refill and the tokens actually left. */
export function backfillBatchSize(
  tokensLeft: number,
  tokensPerMinute: number,
  costPerProduct: number,
) {
  return Math.max(0, Math.floor(Math.min(tokensLeft, tokensPerMinute) / costPerProduct));
}
