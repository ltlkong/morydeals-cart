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
  const product = productFacts(
    ProductDataSchema.parse(stored),
    Date.parse("2026-10-10T00:00:00Z"),
  );
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
