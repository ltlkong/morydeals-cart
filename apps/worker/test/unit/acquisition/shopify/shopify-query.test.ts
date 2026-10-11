import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shopifyQuery } from '../../../../src/acquisition/shopify/shopify-query.ts';
test('Storefront request selects exactly one variant without pagination', () => {
  const target = {
    url: 'https://ca.example.com/products/shirt?variant=202',
    variantId: '202',
    shopDomain: 'example.myshopify.com',
    country: 'CA',
    language: 'EN',
    currency: 'CAD',
  };
  const query = shopifyQuery(target);
  assert.equal(query.variables.variant, 'gid://shopify/ProductVariant/202');
  assert.equal(query.variables.country, 'CA');
  assert.doesNotMatch(query.query, /variants\s*\(|priceRange|pageInfo|after\s*:/);
});
