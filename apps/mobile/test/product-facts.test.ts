import { test } from "node:test";
import assert from "node:assert/strict";
import type { MobileProduct } from "../src/products-api";
import {
  availabilityOf,
  OFFERS_SHOWN,
  capturedAgo,
  countdownText,
  countdownTick,
  dealEnd,
  dealLine,
  dealTag,
  memberLine,
  restatesCompareAt,
  savingsOf,
  categoryPath,
  offerCondition,
  offerFacts,
  offerSummaryLine,
  productHighlights,
  specRows,
  offerRows,
  productTags,
  ratingText,
  shownRows,
} from "../src/product/product-facts";

const product = (
  extra: Partial<MobileProduct> = {},
  availability?: string,
): MobileProduct => ({
  url: "https://shop.example/a",
  title: "A",
  images: [],
  offers: [{ amountMinor: 100, currency: "CAD", availability }],
  ...extra,
});

test("availability comes from the API, or from the stored schema.org name of an older cached product", () => {
  assert.equal(
    availabilityOf(product({ availability: "backorder" })),
    "backorder",
  );
  assert.equal(
    availabilityOf(product({ availability: null }, "InStock")),
    null,
  );
  assert.equal(availabilityOf(product({}, "OutOfStock")), "out_of_stock");
  assert.equal(availabilityOf(product()), null);
});

test("a card says nothing for an in-stock new product without deals, or when the store says nothing", () => {
  assert.deepEqual(
    productTags(product({ availability: "in_stock", condition: "new" })),
    [],
  );
  assert.deepEqual(
    productTags(product({ availability: null, condition: null, deals: [] })),
    [],
  );
  assert.deepEqual(productTags(product({ availability: "limited" })), []);
});

test("a card shows stock problems, a non-new condition and the leading deal, at most two", () => {
  assert.deepEqual(productTags(product({ availability: "out_of_stock" })), [
    { label: "Out of stock" },
  ]);
  assert.deepEqual(
    productTags(
      product({
        condition: "renewed",
        deals: [
          { type: "other", text: "Free delivery" },
          { type: "coupon", text: "Save $5 with coupon" },
          { type: "deal", text: "Lightning deal" },
        ],
      }),
    ),
    [{ label: "Renewed" }, { label: "Limited-time deal", tone: "accent" }],
  );
  assert.deepEqual(
    productTags(
      product({
        availability: "preorder",
        condition: "used",
        deals: [{ type: "sale", text: "Rollback" }],
      }),
    ),
    [{ label: "Pre-order" }, { label: "Used" }],
  );
  assert.deepEqual(
    productTags(product({ deals: [{ type: "sale", text: "Rollback" }] })),
    [{ label: "Rollback", tone: "accent" }],
  );
  assert.deepEqual(
    productTags(product({ deals: [{ type: "other", text: "Free delivery" }] })),
    [],
  );
});

test("ratings read as stars out of 5, other scales say theirs", () => {
  assert.equal(
    ratingText({ value: 4.65, scale: 5, count: 1284 }),
    "4.7 ★ (1,284)",
  );
  assert.equal(ratingText({ value: 8.4, scale: 10 }), "8.4/10");
  assert.equal(ratingText(undefined), undefined);
});

test("a deal line keeps the store's words, its code and its end", () => {
  assert.equal(
    dealLine(
      {
        type: "coupon",
        text: "Save $5 with coupon",
        code: "FALL5",
        validUntil: "2026-10-12T07:00:00Z",
      },
      () => "Oct 12",
      Date.parse("2026-10-01T00:00:00Z"),
    ),
    "Save $5 with coupon · Code FALL5 · Ends Oct 12",
  );
  // Within a week the live countdown beside it says when; the line does not repeat it as a date.
  assert.equal(
    dealLine(
      {
        type: "coupon",
        text: "Save $5 with coupon",
        validUntil: "2026-10-12T07:00:00Z",
      },
      () => "Oct 12",
      Date.parse("2026-10-10T00:00:00Z"),
    ),
    "Save $5 with coupon",
  );
});

const NOW = Date.parse("2026-10-10T20:00:00Z");
const fmt = (amount: number) => `$${(amount / 100).toFixed(2)}`;

test("availability and condition are the offer's own; the product-level fields only back older APIs", () => {
  assert.equal(
    availabilityOf(
      product({
        availability: "in_stock",
        offers: [
          { amountMinor: 1, currency: "CAD", availability: "out_of_stock" },
        ],
      }),
    ),
    "out_of_stock",
  );
  const p = product({
    condition: "used",
    offers: [
      { amountMinor: 1, currency: "CAD" },
      { amountMinor: 2, currency: "CAD", condition: "renewed" },
    ],
  });
  assert.equal(offerCondition(p, p.offers[0]), "used");
  assert.equal(offerCondition(p, p.offers[1]), "renewed");
});

test("countdowns: days and hours, hours and minutes, then seconds in the last hour; nothing once ended", () => {
  const at = (ms: number) => NOW + ms;
  assert.equal(
    countdownText(at(2 * 86_400_000 + 4 * 3_600_000 + 5), NOW),
    "Ends in 2d 4h",
  );
  assert.equal(
    countdownText(at((3 * 60 + 12) * 60_000 + 30_000), NOW),
    "Ends in 3h 12m",
  );
  assert.equal(countdownText(at(12 * 60_000 + 5_000), NOW), "Ends in 12m 05s");
  assert.equal(
    countdownText(at(3 * 3_600_000), NOW, { estimated: true }),
    "Ends in ~3h 0m",
  );
  assert.equal(countdownText(at(0), NOW), undefined);
  assert.equal(countdownText(at(-1000), NOW), undefined);
  assert.equal(
    countdownText("2026-10-10T21:30:00.000Z", NOW),
    "Ends in 1h 30m",
  );
  // Each minute, each second in the last hour, and no ticking once ended or with no end.
  assert.equal(countdownTick(at(2 * 3_600_000), NOW), 60_000);
  assert.equal(countdownTick(at(59 * 60_000), NOW), 1000);
  assert.equal(countdownTick(at(-1), NOW), null);
  assert.equal(countdownTick(undefined, NOW), null);
  assert.equal(capturedAgo("2026-10-10T18:00:00Z", NOW), "captured 2h ago");
  assert.equal(capturedAgo("2026-10-10T19:55:00Z", NOW), "captured 5m ago");
  assert.equal(capturedAgo(undefined, NOW), undefined);
});

const lightning = {
  type: "deal" as const,
  text: "Lightning Deal",
  validUntil: "2026-10-10T21:30:00.000Z",
  validUntilEstimated: true,
  claimedPercent: 57,
};

test("a card's deal with an end shows its countdown, and an ended deal disappears", () => {
  const p = product({
    offers: [
      {
        amountMinor: 100,
        currency: "CAD",
        deals: [lightning],
        dealEndsAt: lightning.validUntil,
        dealEndsEstimated: true,
      },
    ],
  });
  assert.deepEqual(productTags(p, NOW), [
    { label: "Ends in ~1h 30m", tone: "accent" },
  ]);
  assert.deepEqual(productTags(p, Date.parse("2026-10-10T21:30:01Z")), []);
  assert.deepEqual(dealEnd(p, p.offers[0], NOW), {
    at: Date.parse(lightning.validUntil),
    estimated: true,
  });
  assert.equal(
    dealLine(lightning, () => "Oct 10"),
    "Lightning Deal · 57% claimed",
  );
});

test("the offers list: primary first, then by condition and price, each with its own facts", () => {
  const p = product({
    offers: [
      {
        amountMinor: 28900,
        compareAtAmountMinor: 32900,
        currency: "CAD",
        condition: "new",
        seller: "Amazon.ca",
        availability: "in_stock",
        deals: [lightning],
        dealEndsAt: lightning.validUntil,
        dealEndsEstimated: true,
      },
      {
        amountMinor: 23915,
        currency: "CAD",
        condition: "used",
        seller: "Amazon Resale",
      },
      {
        amountMinor: 18900,
        currency: "CAD",
        condition: "used",
        seller: "Second Life Audio",
      },
      {
        amountMinor: 22999,
        currency: "CAD",
        condition: "renewed",
        seller: "Tech Renewed Canada",
        availability: "out_of_stock",
      },
      {
        amountMinor: 30499,
        currency: "CAD",
        condition: "new",
        seller: "Gadget Hub CA",
      },
      { amountMinor: 25000, currency: "CAD", condition: "open_box" },
    ],
  });
  const rows = offerRows(p, fmt, NOW);
  assert.deepEqual(
    rows.map((r) => [r.condition, r.seller, r.price]),
    [
      ["New", "Amazon.ca", "$289.00"],
      ["New", "Gadget Hub CA", "$304.99"],
      ["Open box", undefined, "$250.00"],
      ["Renewed", "Tech Renewed Canada", "$229.99"],
      ["Used", "Second Life Audio", "$189.00"],
      ["Used", "Amazon Resale", "$239.15"],
    ],
  );
  assert.deepEqual(
    {
      was: rows[0].was,
      stock: rows[0].stock,
      percent: rows[0].percent,
      deals: rows[0].deals,
      endsAt: rows[0].endsAt,
      estimated: rows[0].estimated,
    },
    {
      was: "$329.00",
      stock: "In stock",
      percent: "-12%",
      deals: ["Lightning Deal · 57% claimed"],
      endsAt: Date.parse(lightning.validUntil),
      estimated: true,
    },
  );
  assert.equal(rows[3].outOfStock, true);
  assert.equal(rows[3].stock, "Out of stock");
  // Collapsed after three until "Show all".
  assert.equal(shownRows(rows, false).length, OFFERS_SHOWN);
  assert.equal(shownRows(rows, true).length, 6);
  // After the deal ends, its row shows no deal and no countdown.
  const later = offerRows(p, fmt, Date.parse("2026-10-10T22:00:00Z"));
  assert.deepEqual(later[0].deals, []);
  assert.equal(later[0].endsAt, undefined);
});

test("every running deal shows in its offer's row, ends or not; a row with no seller names none", () => {
  const p = product({
    offers: [
      {
        amountMinor: 5082,
        currency: "CAD",
        condition: "new",
        seller: "Amazon.ca",
        deals: [
          { type: "deal", text: "Limited time deal" },
          { type: "coupon", text: "Save $5 with coupon", code: "FALL5" },
          { type: "sale", text: "Sale", validUntil: "2026-10-12T07:00:00Z" },
        ],
      },
      {
        amountMinor: 4828,
        currency: "CAD",
        condition: "new",
        seller: "Amazon.ca",
        purchaseType: "subscription",
        deals: [
          {
            type: "other",
            text: "Save 5% now and up to 15% on repeat deliveries.",
          },
        ],
      },
      {
        amountMinor: 5300,
        currency: "CAD",
        condition: "new",
        seller: "Other Seller",
      },
      { amountMinor: 3000, currency: "CAD", condition: "used" },
    ],
  });
  const rows = offerRows(p, fmt, NOW, () => "Oct 12");
  // The one-time new offers first, then Subscribe & Save, then used.
  assert.deepEqual(
    rows.map((r) => [r.condition, r.seller, r.price]),
    [
      ["New", "Amazon.ca", "$50.82"],
      ["New", "Other Seller", "$53.00"],
      ["Subscribe & Save · 5% off", "Amazon.ca", "$48.28"],
      ["Used", undefined, "$30.00"],
    ],
  );
  // The limited-time deal leads, as on cards; coupons and the dated sale follow.
  assert.deepEqual(rows[0].deals, [
    "Limited time deal",
    "Save $5 with coupon · Code FALL5",
    // Its end is near: the row's countdown says it, not a date.
    "Sale",
  ]);

  assert.deepEqual(rows[2].deals, [
    "Save 5% now and up to 15% on repeat deliveries.",
  ]);
  assert.equal("seller" in rows[3], false);
});

test("parity: every deal states its percent or amount once, with kind-specific card labels", () => {
  const day = (iso: string) => iso.slice(0, 10);
  const now = Date.parse("2026-10-11T00:00:00Z");
  assert.equal(
    dealLine(
      { type: "coupon", text: "Apply 15% coupon", percentOff: 15 },
      day,
      now,
    ),
    "Apply 15% coupon",
  );
  assert.equal(
    dealLine({ type: "sale", text: "Was $2,299.99", percentOff: 26 }, day, now),
    "Was $2,299.99 · 26% off",
  );
  assert.equal(
    dealLine({ type: "sale", text: "Sale", amountOffMinor: 7000 }, day, now),
    "Sale · $70 off",
  );
  assert.equal(
    dealLine(
      {
        type: "promo_code",
        text: "Save $10 promo code: TPLINK10OFF",
        code: "TPLINK10OFF",
        amountOffMinor: 1000,
      },
      day,
      now,
    ),
    "Save $10 promo code: TPLINK10OFF",
  );
  assert.equal(
    dealTag({ type: "coupon", text: "Apply 15% coupon", percentOff: 15 }),
    "15% coupon",
  );
  assert.equal(
    dealTag({ type: "deal", text: "Lightning Deal", kind: "lightning" }),
    "Lightning deal",
  );
  assert.equal(
    dealTag({ type: "deal", text: "Prime Day Deal", kind: "prime_day" }),
    "Prime Day deal",
  );
  assert.equal(
    dealTag({ type: "promo_code", text: "x", code: "X" }),
    "Promo code",
  );
  assert.equal(
    dealTag({ type: "credit", text: "Get a $50 gift card" }),
    undefined,
  );
});

test("parity: offer facts, highlights, offer summary, specs and categories read as the store states them", () => {
  assert.deepEqual(
    offerFacts({
      amountMinor: 100,
      currency: "CAD",
      stockQuantity: 3,
      shipsFrom: "Amazon",
      fee: "$0.55 eco fee might apply",
    }),
    ["Only 3 left", "Ships from Amazon", "$0.55 eco fee might apply"],
  );
  assert.deepEqual(offerFacts({ amountMinor: 100, currency: "CAD" }), []);
  const p = product({
    brand: "roborock",
    badges: ["Amazon's Choice"],
    boughtRecently: "100+ bought in past month",
    categories: ["Home & Kitchen", "Vacuums", "Robotic Vacuums"],
    specifications: [
      { name: "Brand", value: "roborock" },
      { name: "Model name", value: "Saros 20" },
    ],
    offerSummary: {
      count: 3,
      condition: "new",
      fromMinor: 69999,
      currency: "CAD",
      text: "Compare New (3) from $699.99",
    },
  });
  assert.deepEqual(productHighlights(p), [
    "Amazon's Choice",
    "100+ bought in past month",
  ]);
  assert.equal(offerSummaryLine(p), "New (3) from $699.99");
  assert.equal(categoryPath(p), "Home & Kitchen › Vacuums › Robotic Vacuums");
  // The brand the title already shows is not repeated.
  assert.deepEqual(specRows(p), [{ name: "Model name", value: "Saros 20" }]);
  assert.equal(offerSummaryLine(product()), undefined);
});

test("parity: offer rows carry the reference caption and offer facts", () => {
  const rows = offerRows(
    product({
      offers: [
        {
          amountMinor: 169999,
          compareAtAmountMinor: 229999,
          compareAtLabel: "Was",
          currency: "CAD",
          shipsFrom: "Amazon",
        },
        {
          amountMinor: 150000,
          currency: "CAD",
          condition: "used",
          stockQuantity: 1,
        },
      ],
    }),
    (m) => `$${(m / 100).toFixed(2)}`,
    Date.parse("2026-10-11T00:00:00Z"),
  );
  assert.equal(rows[0].wasLabel, "Was");
  assert.deepEqual(rows[0].details, ["Ships from Amazon"]);
  assert.deepEqual(rows[1].details, ["Only 1 left"]);
  assert.equal(rows[1].wasLabel, undefined);
});

const money2 = (m: number) => `$${(m / 100).toFixed(2)}`;
const regularAndMember = () =>
  product({
    offers: [
      {
        amountMinor: 21900,
        currency: "CAD",
        seller: "Pmnianhua furniture",
        availability: "in_stock",
      },
      {
        amountMinor: 19710,
        compareAtAmountMinor: 21900,
        compareAtLabel: "List Price",
        savingsPercent: 10,
        currency: "CAD",
        condition: "new",
        seller: "Pmnianhua furniture",
        purchaseType: "member",
        availability: "in_stock",
        deals: [
          {
            type: "member",
            text: "Exclusive Prime price",
            effectiveMinor: 19710,
            percentOff: 10,
          },
        ],
      },
    ],
  });

test("Prime member price: its own line on the page, its own row label, a 'Prime price' card tag", () => {
  const p = regularAndMember();
  assert.equal(memberLine(p, money2), "Prime member price $197.10 · save 10%");
  const rows = offerRows(p, money2, Date.parse("2026-10-11T00:00:00Z"));
  assert.equal(rows[0].price, "$219.00");
  assert.equal(rows[1].condition, "Prime price");
  assert.equal(rows[1].percent, "-10%");
  // The member deal is the row's label, not a second line.
  assert.deepEqual(rows[1].deals, []);
  assert.deepEqual(
    productTags(p).map((t) => t.label),
    ["Prime price"],
  );
  assert.equal(memberLine(product(), money2), undefined);
});

test("a sale deal that only restates the struck price is not a deal: page, rows and cards", () => {
  const offer = {
    amountMinor: 169999,
    compareAtAmountMinor: 229999,
    compareAtLabel: "Was",
    currency: "CAD",
    deals: [
      { type: "deal" as const, text: "Limited-time deal" },
      { type: "sale" as const, text: "Was $2,299.99", percentOff: 26 },
    ],
  };
  assert.equal(restatesCompareAt(offer.deals[1], 229999), true);
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
  const p = product({ offers: [offer] });
  const rows = offerRows(p, money2, Date.parse("2026-10-11T00:00:00Z"));
  assert.deepEqual(rows[0].deals, ["Limited-time deal"]);
  assert.deepEqual(
    productTags(p).map((t) => t.label),
    ["Limited-time deal"],
  );
  // The stated savings wins over the computed one.
  assert.equal(savingsOf({ ...offer, savingsPercent: 26 }), 26);
  assert.equal(savingsOf(offer), 26);
});
