import type { MobileProduct } from "../products-api";
import type { CatalogPage } from "./catalog-api";

/**
 * The Products section's paging state. `loading` covers both the first page and the next one (items tell them
 * apart); `done` means the server said there is no next page.
 */
export type CatalogFeed = {
  merchant: string | null;
  items: readonly MobileProduct[];
  cursor: string | null;
  status: "loading" | "idle" | "error" | "done";
  error: string;
};

export const startFeed = (merchant: string | null = null): CatalogFeed => ({
  merchant,
  items: [],
  cursor: null,
  status: "loading",
  error: "",
});

/** Whether the shopper reaching the end should fetch another page. */
export const canLoadMore = (feed: CatalogFeed) => feed.status === "idle";

/**
 * A page arrived: append it. A product already shown (it moved up between two pages because it was observed
 * again) is not shown twice.
 */
export function appendPage(feed: CatalogFeed, page: CatalogPage): CatalogFeed {
  const seen = new Set(feed.items.map((item) => item.url));
  return {
    ...feed,
    items: [...feed.items, ...page.items.filter((item) => !seen.has(item.url))],
    cursor: page.nextCursor,
    status: page.nextCursor ? "idle" : "done",
    error: "",
  };
}

export const failPage = (feed: CatalogFeed, error: string): CatalogFeed => ({
  ...feed,
  status: "error",
  error,
});

/** Retrying fetches the page that failed again; what is shown stays. */
export const retryPage = (feed: CatalogFeed): CatalogFeed =>
  feed.status === "error" ? { ...feed, status: "loading", error: "" } : feed;

export const loadingNext = (feed: CatalogFeed): CatalogFeed =>
  canLoadMore(feed) ? { ...feed, status: "loading" } : feed;

/** The section hides only when the catalog (or the chosen store's part of it) is known to be empty. */
export const feedVisible = (feed: CatalogFeed) =>
  !(feed.status === "done" && feed.items.length === 0 && !feed.merchant);

/** Pixels from the bottom at which the next page starts loading, about two rows of cards ahead. */
export const NEAR_END = 600;

/** Whether a scroll position is close enough to the end of the content to fetch the next page. */
export function nearEnd(
  {
    offset,
    viewport,
    content,
  }: { offset: number; viewport: number; content: number },
  threshold = NEAR_END,
) {
  "worklet";
  return content > 0 && offset + viewport >= content - threshold;
}
