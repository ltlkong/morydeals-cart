import type { Merchant } from "../merchants/merchants-api";
import type { BrowserTarget } from "../merchants/MerchantPicker";

/** A store's short name for tiles and rows ("Best Buy Canada" → "Best Buy"). */
export const storeLabel = (name: string) => name.replace(/ Canada$/, "");

/** Moves a store to the front of the recently opened list. */
export function touchRecent(recent: readonly string[], url: string) {
  return [url, ...recent.filter((item) => item !== url)];
}

/** The open store tabs, the most recently opened first. */
export function openTabs(
  sessions: readonly BrowserTarget[],
  recent: readonly string[],
): BrowserTarget[] {
  return recent.flatMap(
    (url) => sessions.find((target) => target.url === url) ?? [],
  );
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

/** The catalog store a page belongs to, by its host (the same match as storeFor). */
export function merchantOf(
  merchants: readonly Merchant[],
  url: string,
): Merchant | undefined {
  const host = new URL(url).hostname.toLowerCase();
  return merchants.find((m) =>
    m.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)),
  );
}

/** One cell of the Browse store grid; `resume` cells reopen a tab that is still open. */
export type StoreTile = {
  key: string;
  name: string;
  logoUrl: string | null;
  target: BrowserTarget;
  resume: boolean;
};

/** The grid's rows while collapsed (returning shoppers); the first run and a search show every store. */
export const COLLAPSED_ROWS = 2;

/**
 * The Browse store grid: stores with an open tab first (the most recent first, marked to continue), then the rest in
 * catalog order, all filtered by the search. Collapsed and not searching, it keeps the first rows (the Other store
 * cell takes the last place) and says how many stores are left out.
 */
export function storeTiles({
  merchants,
  tabs,
  query,
  collapsed,
  allowOthers,
  columns = 3,
  rows = COLLAPSED_ROWS,
}: {
  merchants: readonly Merchant[];
  /** Open tabs, the most recent first (see openTabs). */
  tabs: readonly BrowserTarget[];
  query: string;
  collapsed: boolean;
  allowOthers: boolean;
  columns?: number;
  rows?: number;
}): { tiles: StoreTile[]; hidden: number } {
  const matched = matchStores(merchants, query);
  const q = query.trim().toLowerCase();
  const promoted = new Set<string>();
  const tiles: StoreTile[] = [];
  for (const tab of tabs) {
    const merchant = merchantOf(merchants, tab.url);
    if (merchant) {
      // A store's most recent tab is the one to continue.
      if (promoted.has(merchant.id) || !matched.includes(merchant)) continue;
      promoted.add(merchant.id);
      tiles.push({
        key: merchant.id,
        name: storeLabel(merchant.name),
        logoUrl: merchant.logoUrl,
        target: tab,
        resume: true,
      });
      continue;
    }
    // A store outside the catalog (opened by link) continues under its host.
    const host = new URL(tab.url).hostname.replace(/^www\./, "");
    if (q && !host.toLowerCase().includes(q)) continue;
    if (tiles.some((tile) => tile.key === host)) continue;
    tiles.push({
      key: host,
      name: host,
      logoUrl: tab.logoUrl ?? null,
      target: tab,
      resume: true,
    });
  }
  for (const m of matched)
    if (!promoted.has(m.id))
      tiles.push({
        key: m.id,
        name: storeLabel(m.name),
        logoUrl: m.logoUrl,
        target: { name: m.name, url: m.homeUrl, logoUrl: m.logoUrl },
        resume: false,
      });
  if (!collapsed || q) return { tiles, hidden: 0 };
  const room = Math.max(1, columns * rows - (allowOthers ? 1 : 0));
  return {
    tiles: tiles.slice(0, room),
    hidden: Math.max(0, tiles.length - room),
  };
}

/** Recently viewed on Browse shows at most this many products. */
export const RECENTLY_VIEWED_LIMIT = 10;

/** Browse's Recently viewed: the shopper's history without what is already in the cart (the cart shows those). */
export function recentlyViewed<T extends { url: string }>(
  history: readonly T[],
  cartUrls: readonly string[],
  limit = RECENTLY_VIEWED_LIMIT,
): T[] {
  const inCart = new Set(cartUrls);
  return history.filter((item) => !inCart.has(item.url)).slice(0, limit);
}
