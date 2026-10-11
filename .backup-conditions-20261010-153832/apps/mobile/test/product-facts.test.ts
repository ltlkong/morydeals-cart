import { test } from "node:test";
import assert from "node:assert/strict";
import type { MobileProduct } from "../src/products-api";
import {
  availabilityOf,
  dealLine,
  productTags,
  ratingText,
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
