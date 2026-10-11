import { test } from "node:test";
import assert from "node:assert/strict";
import type { MobileProduct } from "../src/products-api";
import {
  appendPage,
  canLoadMore,
  failPage,
  feedVisible,
  loadingNext,
  nearEnd,
  retryPage,
  startFeed,
} from "../src/browse/catalog-feed";

const product = (n: number): MobileProduct => ({
  url: `https://www.bestbuy.ca/p/${n}`,
  title: `Product ${n}`,
  images: [],
  offers: [{ amountMinor: 1000 + n, currency: "CAD" }],
  history: [],
});

test("pages append in order until the server has no next cursor", () => {
  let feed = startFeed();
  assert.equal(feed.status, "loading");
  assert.equal(canLoadMore(feed), false);
  feed = appendPage(feed, {
    items: [product(1), product(2)],
    nextCursor: "c1",
  });
  assert.equal(feed.status, "idle");
  assert.equal(canLoadMore(feed), true);
  feed = loadingNext(feed);
  assert.equal(feed.status, "loading");
  // Asking again while a page loads changes nothing.
  assert.equal(loadingNext(feed), feed);
  feed = appendPage(feed, { items: [product(3)], nextCursor: null });
  assert.deepEqual(
    feed.items.map((p) => p.title),
    ["Product 1", "Product 2", "Product 3"],
  );
  assert.equal(feed.status, "done");
  assert.equal(canLoadMore(feed), false);
  assert.equal(loadingNext(feed), feed);
});

test("a product that moved up between two pages is not shown twice", () => {
  const feed = appendPage(
    appendPage(startFeed(), {
      items: [product(1), product(2)],
      nextCursor: "c",
    }),
    { items: [product(2), product(3)], nextCursor: "d" },
  );
  assert.deepEqual(
    feed.items.map((p) => p.url),
    [product(1), product(2), product(3)].map((p) => p.url),
  );
  assert.equal(feed.cursor, "d");
});

test("a failed page keeps what is shown and retries the same cursor", () => {
  const shown = appendPage(startFeed(), {
    items: [product(1)],
    nextCursor: "c1",
  });
  const failed = failPage(loadingNext(shown), "Could not load products.");
  assert.equal(failed.status, "error");
  assert.equal(failed.items.length, 1);
  assert.equal(canLoadMore(failed), false);
  const retrying = retryPage(failed);
  assert.equal(retrying.status, "loading");
  assert.equal(retrying.cursor, "c1");
  assert.equal(retrying.error, "");
  assert.equal(retryPage(shown), shown);
});

test("the section hides only for a known-empty catalog, not while loading, failing or filtered", () => {
  assert.equal(feedVisible(startFeed()), true);
  assert.equal(feedVisible(failPage(startFeed(), "x")), true);
  assert.equal(
    feedVisible(appendPage(startFeed(), { items: [], nextCursor: null })),
    false,
  );
  // A store with nothing yet keeps the section (and its chips) so the shopper can switch back.
  assert.equal(
    feedVisible(
      appendPage(startFeed("bestbuy-ca"), { items: [], nextCursor: null }),
    ),
    true,
  );
});

test("the next page starts loading within about two rows of the end", () => {
  assert.equal(nearEnd({ offset: 0, viewport: 800, content: 4000 }), false);
  assert.equal(nearEnd({ offset: 2600, viewport: 800, content: 4000 }), true);
  assert.equal(nearEnd({ offset: 3200, viewport: 800, content: 4000 }), true);
  assert.equal(nearEnd({ offset: 0, viewport: 800, content: 0 }), false);
});
