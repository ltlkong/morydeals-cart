import { test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "node:crypto";
import {
  ProductDataSchema,
  ProductSchema,
  productFacts,
} from "../src/feature/products/schema/products.schema.ts";
import { ProductLookupService } from "../src/feature/catalog/services/product-lookup.service.ts";
import type { PrismaService } from "../src/core/database/services/prisma.service.ts";

const stored = {
  url: "https://shop.example/crew?size=M",
  title: "Merino Crew",
  images: [],
  evidence: "worker evidence",
  variant: {
    id: "CREW-M",
    label: "M · Navy",
    options: [
      { name: "Size", value: "M" },
      { name: "Color", value: "Navy" },
    ],
    evidence: "jsonLd",
  },
  rating: { value: 4.7, scale: 5, count: 312, evidence: "jsonLd" },
  offers: [
    {
      amountMinor: 8900,
      compareAtAmountMinor: 9900,
      currency: "CAD",
      availability: "https://schema.org/BackOrder",
      condition: "renewed",
      promotions: [
        { type: "deal", text: "Limited time deal", evidence: "#dealBadge" },
        {
          type: "coupon",
          text: "Save $5 with coupon",
          validUntil: "2026-10-01T00:00:00.000Z",
          evidence: "#couponFeature",
        },
      ],
      evidence: "secret",
    },
  ],
};

test("the app gets normalized availability, condition and running deals, without evidence", () => {
  const product = productFacts(ProductDataSchema.parse(stored), {
    now: Date.parse("2026-10-10T00:00:00Z"),
  });
  const shown = ProductSchema.parse(product);
  assert.equal(shown.availability, "backorder");
  assert.equal(shown.condition, "renewed");
  // The coupon ended on Oct 1: kept in storage, not shown.
  assert.deepEqual(shown.deals, [{ type: "deal", text: "Limited time deal" }]);
  assert.deepEqual(shown.variant, {
    id: "CREW-M",
    label: "M · Navy",
    options: stored.variant.options,
  });
  assert.deepEqual(shown.rating, { value: 4.7, scale: 5, count: 312 });
  assert.equal(JSON.stringify(shown).includes("evidence"), false);
});

test("older products without the new facts, and malformed facts, stay readable as unknown", () => {
  const plain = productFacts(
    ProductDataSchema.parse({
      url: "https://shop.example/a",
      title: "A",
      images: [],
      offers: [{ amountMinor: 100, currency: "CAD", availability: "InStock" }],
    }),
  );
  assert.equal(plain.availability, "in_stock");
  assert.equal(plain.condition, null);
  assert.deepEqual(plain.deals, []);
  assert.equal(plain.variant, undefined);
  const odd = productFacts(
    ProductDataSchema.parse({
      ...stored,
      rating: { value: 7, scale: 5 },
      variant: { label: "" },
      offers: [
        {
          amountMinor: 100,
          currency: "CAD",
          availability: "MaybeSoon",
          condition: "mint",
          promotions: "Sale",
        },
      ],
    }),
  );
  assert.equal(odd.availability, null);
  assert.equal(odd.condition, null);
  assert.equal(odd.rating, undefined);
  assert.equal(odd.variant, undefined);
  assert.deepEqual(odd.deals, []);
});

test("a URL saved with tracking parameters is answered by its identity's product once captured", async () => {
  const old = "https://shop.example/a?utm_source=ig";
  const clean = "https://shop.example/a";
  const rows = [
    {
      url: old,
      data: {
        url: old,
        title: "Old",
        images: [],
        offers: [{ amountMinor: 100, currency: "CAD" }],
      },
      observed_at: new Date("2026-10-01T00:00:00Z"),
    },
  ];
  let keys: unknown[] = [];
  const db = {
    $queryRaw: async (query: { sql: string; values: unknown[] }) => {
      if (query.sql.includes("external_price_points")) return [];
      keys = query.values;
      return rows.filter((row) =>
        query.values.includes(hash("sha256", row.url)),
      );
    },
  } as unknown as PrismaService;
  const lookup = new ProductLookupService(db);
  // Not captured under its clean URL yet: the older row answers.
  assert.equal((await lookup.describe([old])).get(old)?.product?.title, "Old");
  assert.ok(keys.includes(hash("sha256", clean)));
  rows.push({
    url: clean,
    data: {
      url: clean,
      title: "New",
      images: [],
      offers: [{ amountMinor: 90, currency: "CAD" }],
    },
    observed_at: new Date("2026-10-10T00:00:00Z"),
  });
  const found = (await lookup.describe([old])).get(old)?.product;
  assert.equal(found?.title, "New");
  assert.equal(found?.observedAt, "2026-10-10T00:00:00.000Z");
});

const offer = (
  condition: string | undefined,
  amountMinor: number,
  extra = {},
) => ({
  amountMinor,
  currency: "CAD",
  ...(condition ? { condition } : {}),
  ...extra,
});
const many = (offers: object[]) =>
  ProductDataSchema.parse({
    url: "https://www.amazon.ca/dp/B0CHX1W1XY",
    title: "AirPods Pro",
    images: [],
    offers,
  });

test("the primary offer is new when there is one; other conditions are offered cheapest-first, apart", () => {
  const history = new Map([
    ["used", [{ at: "2026-10-01T00:00:00.000Z", amountMinor: 20500 }]],
  ]);
  const product = ProductSchema.parse(
    productFacts(
      many([
        offer("used", 23915, { seller: "Amazon Resale" }),
        offer("new", 29900, {
          compareAtAmountMinor: 32900,
          seller: "Amazon.ca",
        }),
        offer("renewed", 21999, {
          seller: "Tech Renewed Canada",
          availability: "InStock",
        }),
        offer("used", 19850, { seller: "Second Life Audio" }),
        offer("new", 30499, { seller: "Gadget Hub CA" }),
        offer("used", 100, { currency: "USD" }),
      ]),
      { history },
    ),
  );
  // Existing fields keep meaning "the new offer".
  assert.deepEqual(product.offers, [
    {
      amountMinor: 29900,
      compareAtAmountMinor: 32900,
      currency: "CAD",
      condition: "new",
      seller: "Amazon.ca",
    },
  ]);
  assert.equal(product.condition, "new");
  assert.deepEqual(
    product.otherOffers.map((o) => [
      o.condition,
      o.amountMinor,
      o.seller,
      o.count,
      o.availability,
    ]),
    [
      ["used", 19850, "Second Life Audio", 2, null],
      ["renewed", 21999, "Tech Renewed Canada", 1, "in_stock"],
    ],
  );
  assert.deepEqual(product.otherOffers[0].history, history.get("used"));
  assert.equal(product.otherOffers[1].history, undefined);
});

test("with no new offer the primary is the first offer and names its condition; unstated is read as new", () => {
  const used = productFacts(
    many([offer("used", 9000), offer("renewed", 12000)]),
  );
  assert.equal(used.condition, "used");
  assert.equal(used.offers[0].amountMinor, 9000);
  assert.deepEqual(
    used.otherOffers.map((o) => o.condition),
    ["renewed"],
  );
  const unstated = productFacts(
    many([offer("renewed", 12000), offer(undefined, 15000)]),
  );
  assert.equal(unstated.offers[0].amountMinor, 15000);
  assert.equal(unstated.condition, null);
  assert.deepEqual(
    unstated.otherOffers.map((o) => o.condition),
    ["renewed"],
  );
});

test("history is answered per condition: the primary's own series, never mixed with used prices", async () => {
  const url = "https://www.amazon.ca/dp/B0CHX1W1XY";
  const db = {
    $queryRaw: async (query: { sql: string }) =>
      query.sql.includes("external_price_points")
        ? [
            {
              url,
              at: new Date("2026-10-01T00:00:00Z"),
              amount: 30900n,
              condition: "new",
            },
            {
              url,
              at: new Date("2026-10-01T00:00:00Z"),
              amount: 21000n,
              condition: "used",
            },
            {
              url,
              at: new Date("2026-10-02T00:00:00Z"),
              amount: 29900n,
              condition: null,
            },
          ]
        : [
            {
              url,
              data: many([offer("new", 29900), offer("used", 19850)]),
              observed_at: new Date("2026-10-02T00:00:00Z"),
            },
          ],
  } as unknown as PrismaService;
  const found = (await new ProductLookupService(db).describe([url])).get(url)!;
  assert.deepEqual(
    found.history.map((p) => p.amountMinor),
    [30900, 29900],
  );
  assert.deepEqual(
    found.product?.otherOffers[0].history?.map((p) => p.amountMinor),
    [21000],
  );
});
