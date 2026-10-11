import { useCallback, useEffect, useRef, useState } from "react";
import { userMessage } from "../errors";
import { getCatalogPage } from "./catalog-api";
import {
  appendPage,
  canLoadMore,
  failPage,
  loadingNext,
  retryPage,
  startFeed,
  type CatalogFeed,
} from "./catalog-feed";

/**
 * The Products section's pages: the first loads on mount, `more` fetches the next one (ignored while one is
 * loading or after the last), `filter` restarts at one store, `reload` restarts for pull-to-refresh.
 */
export function useCatalogFeed() {
  const [feed, setFeed] = useState<CatalogFeed>(() => startFeed());
  // The latest state for callbacks, and the request in flight (a new start aborts it).
  const current = useRef(feed);
  current.current = feed;
  const inFlight = useRef<AbortController | null>(null);
  const fetchPage = useCallback(async (from: CatalogFeed) => {
    inFlight.current?.abort();
    const abort = new AbortController();
    inFlight.current = abort;
    try {
      const page = await getCatalogPage({
        cursor: from.cursor,
        merchant: from.merchant,
        signal: abort.signal,
      });
      if (!abort.signal.aborted) setFeed(appendPage(from, page));
    } catch (error) {
      if (!abort.signal.aborted)
        setFeed(
          failPage(
            from,
            userMessage(error, "Could not load products. Please try again."),
          ),
        );
    } finally {
      if (inFlight.current === abort) inFlight.current = null;
    }
  }, []);
  const start = useCallback(
    (merchant: string | null) => {
      const next = startFeed(merchant);
      setFeed(next);
      return fetchPage(next);
    },
    [fetchPage],
  );
  useEffect(() => {
    void start(null);
    return () => inFlight.current?.abort();
  }, [start]);
  const more = useCallback(() => {
    const feed = current.current;
    if (!canLoadMore(feed) || inFlight.current) return;
    const next = loadingNext(feed);
    setFeed(next);
    void fetchPage(next);
  }, [fetchPage]);
  const retry = useCallback(() => {
    const next = retryPage(current.current);
    if (next === current.current) return;
    setFeed(next);
    void fetchPage(next);
  }, [fetchPage]);
  const filter = useCallback(
    (merchant: string | null) => {
      if (merchant !== current.current.merchant) void start(merchant);
    },
    [start],
  );
  const reload = useCallback(() => start(current.current.merchant), [start]);
  return { feed, more, retry, filter, reload };
}
