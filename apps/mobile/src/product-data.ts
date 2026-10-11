import { isMobileProduct, type MobileProduct } from "./products-api";

/** A saved product as the API returns it (cart, lists, history): its data with price history, or null if unknown yet. */
export function productEntry(item: {
  product?: unknown;
  history?: unknown;
}): MobileProduct | null {
  return isMobileProduct(item.product)
    ? { ...item.product, history: priceHistory(item.history) }
    : null;
}
function priceHistory(value: unknown): MobileProduct["history"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point) => {
    const p = point as { at?: unknown; amountMinor?: unknown };
    return typeof p.at === "string" &&
      (p.amountMinor === null ||
        (typeof p.amountMinor === "number" && p.amountMinor > 0))
      ? [{ at: p.at, amountMinor: p.amountMinor as number | null }]
      : [];
  });
}
