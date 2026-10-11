import type { Merchant } from "../merchants/merchants-api";
import type { BrowserTarget } from "../merchants/MerchantPicker";

/** Continue shopping offers at most this many open store tabs. */
export const CONTINUE_LIMIT = 2;

/** A store's short name for tiles and rows ("Best Buy Canada" → "Best Buy"). */
export const storeLabel = (name: string) => name.replace(/ Canada$/, "");

/** Moves a store to the front of the recently opened list. */
export function touchRecent(recent: readonly string[], url: string) {
  return [url, ...recent.filter((item) => item !== url)];
}

/** The open store tabs to offer again, the most recently opened first. */
export function continueTargets(
  sessions: readonly BrowserTarget[],
  recent: readonly string[],
  limit = CONTINUE_LIMIT,
): BrowserTarget[] {
  return recent
    .flatMap((url) => sessions.find((target) => target.url === url) ?? [])
    .slice(0, limit);
}

/** Stores whose name or domain contains the query; an empty query keeps them all, in catalog order. */
export function matchStores(
  merchants: readonly Merchant[],
  query: string,
): Merchant[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...merchants];
  return merchants.filter(
    (m) =>
      storeLabel(m.name).toLowerCase().includes(q) ||
      m.domains.some((domain) => domain.toLowerCase().includes(q)),
  );
}

/** The intro strip shows until the shopper has a product or dismisses it; never before both are known. */
export function showIntro({
  cartReady,
  cartCount,
  dismissedReady,
  dismissed,
}: {
  cartReady: boolean;
  cartCount: number;
  dismissedReady: boolean;
  dismissed: boolean;
}) {
  return cartReady && dismissedReady && !dismissed && cartCount === 0;
}
