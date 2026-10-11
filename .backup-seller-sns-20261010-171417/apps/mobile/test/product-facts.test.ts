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
  offerCondition,
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
    ),
    "Save $5 with coupon · Code FALL5 · Ends Oct 12",
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
      deal: rows[0].deal,
      endsAt: rows[0].endsAt,
      estimated: rows[0].estimated,
    },
    {
      was: "$329.00",
      stock: "In stock",
      deal: "Lightning Deal",
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
  assert.equal(later[0].deal, undefined);
  assert.equal(later[0].endsAt, undefined);
});
