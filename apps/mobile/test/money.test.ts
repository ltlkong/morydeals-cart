import { test } from "node:test";
import assert from "node:assert/strict";
import { money } from "../src/money";

test("prices show their currency's symbol, never its code", () => {
  assert.equal(money(62700, "CAD"), "$627.00");
  assert.equal(money(1709, "CAD"), "$17.09");
  // Another currency stays distinguishable from Canadian dollars.
  assert.equal(money(62700, "USD"), "US$627.00");
  assert.equal(money(62700, "EUR"), "€627.00");
  assert.equal(money(62700, "GBP"), "£627.00");
  // Minor units follow the currency: yen has none.
  assert.equal(money(627, "JPY"), "JP¥627");
  assert.doesNotMatch(money(62700, "CAD"), /CAD/);
});
