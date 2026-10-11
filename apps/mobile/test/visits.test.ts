import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldVisit } from "../src/merchants/visit-filter";

test("automatic visits skip pages that can hold personal data", () => {
  for (const url of [
    "https://www.amazon.ca/gp/cart/view.html",
    "https://www.amazon.ca/ap/signin?openid=x",
    "https://www.bestbuy.ca/en-ca/basket",
    "https://www.walmart.ca/en/checkout",
    "https://ca.shein.com/user/orders",
    "https://shop.example/account/login",
  ])
    assert.equal(shouldVisit(url), false, url);
  for (const url of [
    "https://www.amazon.ca/dp/B00MW8G3YU",
    "https://www.walmart.ca/en/ip/sofa/4SV84AV3CA6F",
    "https://ca.shein.com/Women-Clothing-c-2030.html",
  ])
    assert.equal(shouldVisit(url), true, url);
});
