import type { PriceSparkTrend } from "@morydeals/ui";
import {
  HISTORY_DAYS,
  dailyPrices,
  priceSummary,
  type PricePoint,
} from "@morydeals/ui/price-history";

export type { PricePoint };

/**
 * A card's mini chart: the same 30 days as the product page's chart (today's live price last, no price where none
 * was offered), with what the price says now.
 */
export function priceTrend(
  history: readonly PricePoint[],
  currentMinor: number,
  now = new Date(),
): PriceSparkTrend & { label: string } {
  const days = dailyPrices(history, currentMinor, now.getTime());
  const summary = priceSummary(days);
  const known = days.flatMap((day) =>
    day.amountMinor === null ? [] : [day.amountMinor],
  );
  // The last different price before today's: a lower price now is a drop.
  const previous = [...known]
    .reverse()
    .find((amount) => amount !== currentMinor);
  const state =
    summary.key === "lowest"
      ? "low"
      : previous !== undefined && currentMinor < previous
        ? "drop"
        : "steady";
  return {
    state,
    days,
    label:
      summary.key === "first"
        ? "First price recorded; history is building"
        : state === "low"
          ? `Lowest price in ${HISTORY_DAYS} days`
          : state === "drop"
            ? "Price dropped recently"
            : `Price history over ${HISTORY_DAYS} days`,
  };
}
