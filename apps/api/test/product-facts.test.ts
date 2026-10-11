import { test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "node:crypto";
import {
  ProductDataSchema,
  ProductSchema,
  offerKey,
  productFacts,
  restatesCompareAt,
  servableImage,
  withoutDelivery,
  bareSale,
  seriesKey,
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

test("Subscribe & Save is its own offer: never the primary, listed after the one-time new offers, its own history", () => {
  const byCondition = new Map([
    ["new", [{ at: "2026-10-01T00:00:00.000Z", amountMinor: 5082 }]],
    [
      "subscription:new",
      [{ at: "2026-10-01T00:00:00.000Z", amountMinor: 4828 }],
    ],
  ]);
  const byOffer = new Map([
    [
      "subscription:new\nAmazon.ca",
      [{ at: "2026-10-01T00:00:00.000Z", amountMinor: 4828 }],
    ],
  ]);
  const product = ProductSchema.parse(
    productFacts(
      many([
        offer("new", 4828, {
          seller: "Amazon.ca",
          purchaseType: "subscription",
          promotions: [
            {
              type: "other",
              text: "Save 5% now and up to 15% on repeat deliveries.",
            },
          ],
        }),
        offer("used", 3000, { seller: "Warehouse Deals" }),
        offer("new", 5082, { seller: "Amazon.ca" }),
        offer("new", 5300, { seller: "Other Seller" }),
      ]),
      { history: { byCondition, byOffer } },
    ),
  );
  assert.deepEqual(
    product.offers.map((o) => [o.condition, o.purchaseType, o.amountMinor]),
    [
      ["new", "one_time", 5082],
      ["new", "one_time", 5300],
      ["new", "subscription", 4828],
      ["used", "one_time", 3000],
    ],
  );
  // The one-time new price's history never holds the subscription price.
  assert.deepEqual(product.offers[0].history, byCondition.get("new"));
  assert.deepEqual(
    product.offers[2].history,
    byOffer.get("subscription:new\nAmazon.ca"),
  );
  assert.equal(
    product.offers[2].deals[0].text,
    "Save 5% now and up to 15% on repeat deliveries.",
  );
  // With only a subscription and a used offer, the used one-time offer is the primary.
  const used = productFacts(
    many([
      offer("new", 4828, { purchaseType: "subscription" }),
      offer("used", 3000),
    ]),
  );
  assert.equal(used.offers[0].condition, "used");
});

test("a deal stored as only its frozen countdown reads as a deal, with no stale time", () => {
  const product = productFacts(
    many([
      offer("new", 39999, {
        promotions: [{ type: "deal", text: "Ends in 08:17:30" }],
      }),
    ]),
  );
  assert.deepEqual(product.offers[0].deals, [{ type: "deal", text: "Deal" }]);
});

test("parser parity: product and offer facts and every deal kind reach the app as stated", () => {
  const data = ProductDataSchema.parse({
    url: "https://www.amazon.ca/dp/B0GHY558KL",
    title: "Leather Boot Care Kit",
    images: [],
    brand: "GleamGlee",
    badges: ["Amazon's Choice"],
    boughtRecently: "100+ bought in past month",
    categories: ["Clothing, Shoes & Accessories", "Shoe Care Kits & Sets"],
    specifications: [{ name: "Model name", value: "Saros 20" }],
    offerSummary: {
      count: 3,
      condition: "new",
      fromMinor: 69999,
      currency: "CAD",
      text: "Compare New (3) from $699.99",
    },
    offers: [
      {
        amountMinor: 3299,
        compareAtAmountMinor: 3999,
        currency: "CAD",
        compareAtLabel: "Was",
        shipsFrom: "Amazon",
        delivery: "FREE delivery Monday, October 19",
        stockQuantity: 3,
        fee: "$0.55 eco fee might apply",
        promotions: [
          {
            type: "coupon",
            text: "Apply 15% coupon",
            percentOff: 15,
            promotionId: "AK2WXDI4S0N04",
            evidence: "PromotionsDiscovery",
          },
          {
            type: "promo_code",
            text: "Save $10 promo code: TPLINK10OFF",
            code: "TPLINK10OFF",
            amountOffMinor: 1000,
            evidence: "x",
          },
          { type: "credit", text: "Get a $50 gift card", evidence: "x" },
          {
            type: "multi_buy",
            text: "Save 5% on 2 select items",
            evidence: "x",
          },
          {
            type: "deal",
            text: "Prime Day Deal",
            kind: "prime_day",
            evidence: "x",
          },
          { type: "sale", text: "Was $39.99", percentOff: 18, evidence: "x" },
        ],
      },
    ],
  });
  const product = ProductSchema.parse(
    productFacts(data, { now: Date.parse("2026-10-11T00:00:00Z") }),
  );
  assert.deepEqual(product.badges, ["Amazon's Choice"]);
  assert.equal(product.boughtRecently, "100+ bought in past month");
  assert.equal(product.offerSummary?.count, 3);
  assert.deepEqual(product.specifications, [
    { name: "Model name", value: "Saros 20" },
  ]);
  const [offer] = product.offers;
  assert.equal(offer.compareAtLabel, "Was");
  assert.equal(offer.shipsFrom, "Amazon");
  assert.equal(offer.stockQuantity, 3);
  assert.equal(offer.fee, "$0.55 eco fee might apply");
  // Newer deal types never make the whole list unreadable.
  assert.deepEqual(
    offer.deals.map((d) => [d.type, d.percentOff, d.amountOffMinor, d.kind]),
    [
      ["coupon", 15, undefined, undefined],
      ["promo_code", undefined, 1000, undefined],
      ["credit", undefined, undefined, undefined],
      ["multi_buy", undefined, undefined, undefined],
      ["deal", undefined, undefined, "prime_day"],
    ],
  );
  assert.equal(offer.deals[0].promotionId, "AK2WXDI4S0N04");
  // The stored "Was $39.99" sale (parser 3.17.0) only restated the struck price: dropped as a deal, its stated
  // percent kept on the offer.
  assert.equal(offer.savingsPercent, 18);
  // Delivery wording stored by parser 3.17.0 is not sent.
  assert.equal("delivery" in offer, false);
});

test("a Prime member price is its own offer: never the primary, after one-time new, its own history series", () => {
  const data = ProductDataSchema.parse({
    url: "https://www.amazon.ca/dp/B0BWDNXK3Q",
    title: "Desk",
    images: [],
    offers: [
      {
        amountMinor: 19710,
        compareAtAmountMinor: 21900,
        compareAtLabel: "List Price",
        savingsPercent: 10,
        currency: "CAD",
        condition: "new",
        seller: "Pmnianhua furniture",
        purchaseType: "member",
        promotions: [
          {
            type: "member",
            text: "Exclusive Prime price",
            effectiveMinor: 19710,
            percentOff: 10,
            evidence: "x",
          },
        ],
      },
      {
        amountMinor: 21900,
        currency: "CAD",
        condition: "new",
        seller: "Pmnianhua furniture",
      },
      { amountMinor: 18000, currency: "CAD", condition: "used" },
    ],
  });
  const at = "2026-10-11T00:49:49.000Z";
  const history = {
    byCondition: new Map([
      [seriesKey("new"), [{ at, amountMinor: 21900 }]],
      [seriesKey("new", "member"), [{ at, amountMinor: 19710 }]],
    ]),
    byOffer: new Map([
      [
        offerKey("new", "Pmnianhua furniture", "member"),
        [{ at, amountMinor: 19710 }],
      ],
    ]),
  };
  const product = ProductSchema.parse(productFacts(data, { history }));
  assert.deepEqual(
    product.offers.map((o) => [o.amountMinor, o.purchaseType, o.condition]),
    [
      [21900, "one_time", "new"],
      [19710, "member", "new"],
      [18000, "one_time", "used"],
    ],
  );
  // The regular price's series never holds member prices; the member price has its own.
  assert.deepEqual(product.offers[0].history, [{ at, amountMinor: 21900 }]);
  assert.deepEqual(product.offers[1].history, [{ at, amountMinor: 19710 }]);
  assert.equal(seriesKey("new", "member"), "member:new");
  assert.equal(product.offers[1].deals[0].effectiveMinor, 19710);
  assert.equal(product.offers[1].savingsPercent, 10);
});

test("a sale deal restating the struck price is dropped; a real sale and other deals stay", () => {
  assert.equal(
    restatesCompareAt({ type: "sale", text: "Was $2,299.99" }, 229999),
    true,
  );
  assert.equal(
    restatesCompareAt({ type: "sale", text: "List Price $249.99" }, 24999),
    true,
  );
  assert.equal(
    restatesCompareAt({ type: "sale", text: "Was $2,299.99" }, 199999),
    false,
  );
  assert.equal(
    restatesCompareAt({ type: "sale", text: "Sale" }, 229999),
    false,
  );
  assert.equal(
    restatesCompareAt({ type: "deal", text: "Was $2,299.99" }, 229999),
    false,
  );
  const data = ProductDataSchema.parse({
    url: "https://www.amazon.ca/dp/B0G64MM1HM",
    title: "Saros 20",
    images: [],
    offers: [
      {
        amountMinor: 169999,
        compareAtAmountMinor: 229999,
        compareAtLabel: "Was",
        currency: "CAD",
        promotions: [
          { type: "deal", text: "Limited-time deal", evidence: "x" },
          {
            type: "sale",
            text: "Was $2,299.99",
            percentOff: 26,
            evidence: "x/reference-price",
          },
        ],
      },
    ],
  });
  const [offer] = productFacts(data).offers;
  assert.deepEqual(
    offer.deals.map((d) => d.text),
    ["Limited-time deal"],
  );
  assert.equal(offer.savingsPercent, 26);
  assert.equal(offer.compareAtLabel, "Was");
});

test("Best Buy: stored 1500x1500 images are served at 500x500; a bare Sale or a restated $ off is not a deal", () => {
  assert.equal(
    servableImage(
      "https://multimedia.bbycastatic.ca/multimedia/products/1500x1500/171/17158/17158465.jpg",
    ),
    "https://multimedia.bbycastatic.ca/multimedia/products/500x500/171/17158/17158465.jpg",
  );
  assert.equal(
    servableImage("https://m.media-amazon.com/images/I/71x.jpg"),
    "https://m.media-amazon.com/images/I/71x.jpg",
  );
  const data = ProductDataSchema.parse({
    url: "https://www.bestbuy.ca/en-ca/product/17158465",
    title: "Frigidaire dishwasher",
    images: [
      "https://multimedia.bbycastatic.ca/multimedia/products/1500x1500/171/17158/17158465.jpg",
      "https://multimedia.bbycastatic.ca/multimedia/products/500x500/171/17158/17158465.jpg",
      "https://multimedia.bbycastatic.ca/multimedia/products/1500x1500/171/17158/17158465_1.jpg",
    ],
    offers: [
      {
        amountMinor: 52599,
        compareAtAmountMinor: 57999,
        currency: "CAD",
        promotions: [
          { type: "sale", text: "Sale", evidence: "x" },
          {
            type: "sale",
            text: "Sale",
            amountOffMinor: 5400,
            validUntil: "2026-10-16T07:00:00.000Z",
            evidence: "x",
          },
          { type: "sale", text: "Clearance", evidence: "x" },
          {
            type: "other",
            text: "Get $200 off a watch",
            amountOffMinor: 20000,
            evidence: "x",
          },
        ],
      },
    ],
  });
  const product = productFacts(data, {
    now: Date.parse("2026-10-11T00:00:00Z"),
  });
  assert.deepEqual(product.images, [
    "https://multimedia.bbycastatic.ca/multimedia/products/500x500/171/17158/17158465.jpg",
    "https://multimedia.bbycastatic.ca/multimedia/products/500x500/171/17158/17158465_1.jpg",
  ]);
  assert.deepEqual(
    product.offers[0].deals.map((d) => [
      d.text,
      d.amountOffMinor,
      d.validUntil,
    ]),
    [
      // The sale with an end stays (its countdown), without the $54 off the struck price already shows.
      ["Sale", undefined, "2026-10-16T07:00:00.000Z"],
      ["Clearance", undefined, undefined],
      ["Get $200 off a watch", 20000, undefined],
    ],
  );
  assert.equal(
    bareSale({ type: "sale", text: "Sale" }, { amountMinor: 100 }),
    false,
  );
});

test("stored deal words lose a delivery sentence (Best Buy special offer, parser 3.19.0)", () => {
  assert.equal(
    withoutDelivery(
      "Get up to $1,000 off in-cart when you buy 2 or more select major kitchen appliances of the same brand.* Plus, enjoy free local delivery and haul away.",
    ),
    "Get up to $1,000 off in-cart when you buy 2 or more select major kitchen appliances of the same brand.*",
  );
  assert.equal(withoutDelivery("Save 15% with coupon"), "Save 15% with coupon");
});
