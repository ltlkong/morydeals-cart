import { test } from "node:test";
import assert from "node:assert/strict";
import { percentOff, storeFor } from "../src/product/product-store";

const catalog = {
  allowOthers: true,
  merchants: [
    {
      id: "amazon",
      name: "Amazon",
      homeUrl: "https://www.amazon.ca/",
      logoUrl: "https://cdn/amazon.png",
      domains: ["amazon.ca"],
    },
    {
      id: "shein",
      name: "SHEIN",
      homeUrl: "https://m.shein.com/ca/",
      logoUrl: null,
      domains: ["shein.com"],
    },
  ],
};

test("a product opens in its own store's browser, named and branded like the store tile", () => {
  assert.deepEqual(storeFor("https://www.amazon.ca/dp/B0CCZ1SQ8G", catalog), {
    name: "Amazon",
    url: "https://www.amazon.ca/dp/B0CCZ1SQ8G",
    logoUrl: "https://cdn/amazon.png",
  });
  // Subdomains of a store's host belong to it; an unknown host is named by its hostname.
  assert.equal(
    storeFor("https://ca.shein.com/x-p-1.html", catalog).name,
    "SHEIN",
  );
  assert.deepEqual(storeFor("https://shop.example/p/1", catalog), {
    name: "shop.example",
    url: "https://shop.example/p/1",
  });
  assert.equal(
    storeFor("https://notamazon.ca/p", catalog).name,
    "notamazon.ca",
  );
});

test("a discount shows from 5% and never rounds to zero", () => {
  assert.equal(percentOff(9000, 10000), 10);
  assert.equal(percentOff(9600, 10000), undefined);
  assert.equal(percentOff(10000, undefined), undefined);
  assert.equal(percentOff(10000, 9000), undefined);
});

test("a swipe back closes past a third of the screen, or on a quick fling, and never on a leftward one", async () => {
  const { closesOnRelease } = await import("../src/product/swipe-back");
  assert.equal(closesOnRelease(140, 0, 390), true);
  assert.equal(closesOnRelease(100, 0, 390), false);
  assert.equal(closesOnRelease(40, 900, 390), true);
  // A fling back toward the left keeps the page even past the threshold.
  assert.equal(closesOnRelease(200, -600, 390), false);
});
