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

test("every offer is its own: condition, seller, stock, deals and history; the primary (new) comes first", () => {
  const byCondition = new Map([
    ["new", [{ at: "2026-10-01T00:00:00.000Z", amountMinor: 30900 }]],
  ]);
  const byOffer = new Map([
    [
      "used\nSecond Life Audio",
      [{ at: "2026-10-01T00:00:00.000Z", amountMinor: 20500 }],
    ],
  ]);
  const product = ProductSchema.parse(
    productFacts(
      many([
        offer("used", 23915, { seller: "Amazon Resale" }),
        offer("new", 29900, {
          compareAtAmountMinor: 32900,
          seller: "Amazon.ca",
          availability: "InStock",
          promotions: [
            {
              type: "deal",
              text: "Lightning Deal",
              validUntil: "2026-10-10T21:30:00.000Z",
              validUntilEstimated: true,
              kind: "lightning",
              claimedPercent: 57,
            },
            {
              type: "sale",
              text: "Sale",
              validUntil: "2026-10-13T06:59:00.000Z",
            },
          ],
        }),
        offer("renewed", 21999, { seller: "Tech Renewed Canada" }),
        offer("used", 19850, { seller: "Second Life Audio" }),
        offer(undefined, 30499, { seller: "Gadget Hub CA" }),
      ]),
      {
        now: Date.parse("2026-10-10T20:00:00Z"),
        history: { byCondition, byOffer },
      },
    ),
  );
  assert.deepEqual(
    product.offers.map((o) => [o.condition, o.amountMinor, o.seller]),
    [
      ["new", 29900, "Amazon.ca"],
      [null, 30499, "Gadget Hub CA"],
      ["renewed", 21999, "Tech Renewed Canada"],
      ["used", 19850, "Second Life Audio"],
      ["used", 23915, "Amazon Resale"],
    ],
  );
  const [primary] = product.offers;
  assert.equal(primary.availability, "in_stock");
  assert.equal(primary.compareAtAmountMinor, 32900);
  // The soonest running deal end, and that it was estimated from the page's countdown.
  assert.equal(primary.dealEndsAt, "2026-10-10T21:30:00.000Z");
  assert.equal(primary.dealEndsEstimated, true);
  assert.equal(primary.deals[0].claimedPercent, 57);
  assert.deepEqual(primary.history, byCondition.get("new"));
  assert.deepEqual(
    product.offers[3].history,
    byOffer.get("used\nSecond Life Audio"),
  );
  assert.equal(product.offers[4].history, undefined);
  assert.equal(product.offers[4].dealEndsAt, null);
  // The deprecated product-level fields mirror the primary offer.
  assert.equal(product.condition, "new");
  assert.equal(product.availability, "in_stock");
  assert.equal(product.deals.length, 2);
});

test("a deal past its end is not sent, and its end no longer counts", () => {
  const product = productFacts(
    many([
      offer("new", 29900, {
        promotions: [
          {
            type: "deal",
            text: "Lightning Deal",
            validUntil: "2026-10-10T21:30:00.000Z",
            validUntilEstimated: true,
          },
          {
            type: "sale",
            text: "Sale",
            validUntil: "2026-10-13T06:59:00.000Z",
          },
        ],
      }),
    ]),
    { now: Date.parse("2026-10-10T22:00:00Z") },
  );
  assert.deepEqual(
    product.offers[0].deals.map((d) => d.text),
    ["Sale"],
  );
  assert.equal(product.offers[0].dealEndsAt, "2026-10-13T06:59:00.000Z");
  assert.equal(product.offers[0].dealEndsEstimated, false);
});

test("with no new offer the primary is the first offer and names its condition; unstated is read as new", () => {
  const used = productFacts(
    many([offer("used", 9000), offer("renewed", 12000)]),
  );
  assert.equal(used.condition, "used");
  assert.deepEqual(
    used.offers.map((o) => o.condition),
    ["used", "renewed"],
  );
  const unstated = productFacts(
    many([offer("renewed", 12000), offer(undefined, 15000)]),
  );
  assert.equal(unstated.offers[0].amountMinor, 15000);
  assert.equal(unstated.condition, null);
});

test("history per offer: the primary's featured series and each other offer's own, never mixed", async () => {
  const url = "https://www.amazon.ca/dp/B0CHX1W1XY";
  const at = (day: number) => new Date(`2026-10-0${day}T00:00:00Z`);
  const row = (
    day: number,
    obs: number | null,
    index: number | null,
    condition: string | null,
    seller: string | null,
    amount: bigint,
  ) => ({
    url,
    at: at(day),
    amount,
    condition,
    seller,
    observation: obs === null ? null : BigInt(obs),
    offer_index: index,
  });
  const db = {
    $queryRaw: async (query: { sql: string }) =>
      query.sql.includes("external_price_points")
        ? [
            row(1, null, null, "new", null, 31900n),
            // Capture 2: the featured new offer first; another seller's cheaper new offer is not the featured price.
            row(2, 2, 0, "new", "Amazon.ca", 29900n),
            row(2, 2, 1, "used", "Amazon Resale", 23915n),
            row(2, 2, 2, "used", "Second Life Audio", 19850n),
            row(2, 2, 3, null, "Gadget Hub CA", 28000n),
            row(3, 3, 0, "new", "Amazon.ca", 28900n),
            row(3, 3, 1, "used", "Second Life Audio", 18900n),
          ]
        : [
            {
              url,
              data: many([
                offer("new", 28900, { seller: "Amazon.ca" }),
                offer("used", 18900, { seller: "Second Life Audio" }),
                offer("used", 23915, { seller: "Amazon Resale" }),
              ]),
              observed_at: at(3),
            },
          ],
  } as unknown as PrismaService;
  const found = (await new ProductLookupService(db).describe([url])).get(url)!;
  const amounts = (points?: { amountMinor: number | null }[]) =>
    points?.map((p) => p.amountMinor);
  assert.deepEqual(amounts(found.history), [31900, 29900, 28900]);
  assert.deepEqual(
    amounts(found.product?.offers[0].history),
    [31900, 29900, 28900],
  );
  assert.deepEqual(amounts(found.product?.offers[1].history), [19850, 18900]);
  assert.deepEqual(amounts(found.product?.offers[2].history), [23915]);
});
