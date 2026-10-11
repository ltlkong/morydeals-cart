import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseShopifyProduct,
  resolveShopifyTarget,
  type PageDocument,
} from '../../../../src/parsing/parsers/index.ts';
const url = 'https://ca.example.com/products/shirt?variant=202';
const store = {
  shopDomain: 'example.myshopify.com',
  country: 'CA',
  language: 'EN',
  currency: 'CAD',
};
const html = `<script>Shopify.shop = "example.myshopify.com";</script>`;
const payload = () => ({
  extensions: { context: { country: 'CA', language: 'EN' } },
  data: {
    shop: { name: 'Example', primaryDomain: { url: 'https://ca.example.com' } },
    product: {
      id: 'gid://shopify/Product/10',
      handle: 'shirt',
      title: 'Shirt',
      vendor: 'Example',
      description: 'Cotton',
      requiresSellingPlan: false,
    },
    selected: {
      id: 'gid://shopify/ProductVariant/202',
      product: { id: 'gid://shopify/Product/10' },
      title: 'Blue / M',
      sku: 'BLUE-M',
      availableForSale: true,
      currentlyNotInStock: false,
      price: { amount: '19.95', currencyCode: 'CAD' },
      compareAtPrice: { amount: '29.95', currencyCode: 'CAD' },
      image: { url: 'https://cdn.shopify.com/blue.jpg' },
    },
  },
});
// Mutations deliberately give fields the wrong type or shape to test rejection.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = any;
const document = (): PageDocument => ({
  version: '1',
  url,
  requestedUrl: url,
  fetchedAt: '2026-10-09T00:00:00Z',
  markdown: '',
  metadata: {},
  jsonLd: [],
  storefront: {
    target: { ...store, url, variantId: '202' },
    response: payload(),
  },
});
test('Storefront parser returns only the selected variant', () => {
  const result = parseShopifyProduct(document());
  assert.equal(result.status, 'parsed');
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].variantId, '202');
  assert.equal(result.products[0].sku, 'BLUE-M');
  assert.deepEqual(result.products[0].images, ['https://cdn.shopify.com/blue.jpg']);
  assert.equal(result.products[0].offers[0].amountMinor, 1995);
  assert.equal(result.products[0].offers[0].compareAtAmountMinor, 2995);
});
test('Storefront rejects another product/variant, market/currency, query errors and subscription-only prices', () => {
  for (const mutate of [
    (p: Payload) => {
      p.data.selected.id = 'gid://shopify/ProductVariant/203';
    },
    (p: Payload) => {
      p.data.selected.product.id = 'gid://shopify/Product/11';
    },
    (p: Payload) => {
      p.data.product.handle = 'pants';
    },
    (p: Payload) => {
      p.extensions.context.country = 'US';
    },
    (p: Payload) => {
      p.data.selected.price.currencyCode = 'USD';
    },
    (p: Payload) => {
      p.data.selected.compareAtPrice.currencyCode = 'USD';
    },
    (p: Payload) => {
      p.data.selected.price.amount = '19.955';
    },
    (p: Payload) => {
      p.data.selected.price.amount = 19.95;
    },
    (p: Payload) => {
      p.data.product.requiresSellingPlan = true;
    },
    (p: Payload) => {
      p.errors = [{ message: 'THROTTLED' }];
    },
    (p: Payload) => {
      p.data.shop.primaryDomain.url = 'https://other.example';
    },
    (p: Payload) => {
      p.data.selected = null;
    },
  ]) {
    const doc = document();
    mutate(doc.storefront!.response);
    const result = parseShopifyProduct(doc);
    assert.equal(result.status, 'needs_review');
    assert.deepEqual(result.products, []);
  }
});
test('no URL variant uses only an unambiguous current page selection, not first available', () => {
  const unselected = 'https://ca.example.com/products/shirt';
  assert.equal(
    resolveShopifyTarget(
      `${html}<form action="/cart/add"><input name="id" value="202"></form>`,
      unselected,
      unselected,
      store,
    ).variantId,
    '202',
  );
  assert.equal(
    resolveShopifyTarget(
      `${html}<script type="application/json" data-selected-variant>{"id":202}</script>`,
      unselected,
      unselected,
      store,
    ).variantId,
    '202',
  );
  for (const extra of [
    '',
    '<script type="application/json">{"variants":[{"id":201},{"id":202}]}</script>',
    '<form action="/cart/add"><input name="id" value="201"><input name="id" value="202"></form>',
  ])
    assert.throws(
      () => resolveShopifyTarget(html + extra, unselected, unselected, store),
      /one selected variant/,
    );
});
test('Shopify store binding, requested identity, duplicate variants and redirects fail closed', () => {
  assert.throws(() => resolveShopifyTarget('', url, url, store), /domain/);
  assert.throws(
    () =>
      resolveShopifyTarget(html, url, url, {
        ...store,
        shopDomain: 'other.myshopify.com',
      }),
    /domain/,
  );
  assert.throws(() => resolveShopifyTarget(html, url, url.replace('202', '201'), store), /variant/);
  assert.throws(() => resolveShopifyTarget(html, url + '&variant=203', url, store), /ambiguous/);
  const doc = document();
  doc.requestedUrl = url.replace('202', '201');
  assert.equal(parseShopifyProduct(doc).status, 'needs_review');
});
test('Storefront backorder and exact zero-decimal MoneyV2 do not use Liquid scaling', () => {
  const doc = document();
  const response = doc.storefront!.response as ReturnType<typeof payload>;
  doc.storefront!.target.currency = 'JPY';
  response.data.selected.price = { amount: '1995', currencyCode: 'JPY' };
  response.data.selected.compareAtPrice = {
    amount: '2995',
    currencyCode: 'JPY',
  };
  response.data.selected.currentlyNotInStock = true;
  const result = parseShopifyProduct(doc);
  assert.equal(result.products[0].offers[0].amountMinor, 1995);
  assert.equal(result.products[0].offers[0].availability, 'BackOrder');
});

test('Storefront keeps current price and records an issue when compare-at is below current', () => {
  const doc = document();
  const response = payload();
  response.data.selected.price.amount = '3199.0';
  response.data.selected.compareAtPrice.amount = '2899.0';
  doc.storefront!.response = response;
  const result = parseShopifyProduct(doc);
  assert.equal(result.status, 'parsed');
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].offers[0].amountMinor, 319900);
  assert.equal(result.products[0].offers[0].compareAtAmountMinor, undefined);
  assert.equal(result.products[0].offers[0].compareAtEvidence, undefined);
  assert.ok(result.issues.some((issue) => issue.includes('below current price')));
  assert.equal(response.data.selected.compareAtPrice.amount, '2899.0');
});
