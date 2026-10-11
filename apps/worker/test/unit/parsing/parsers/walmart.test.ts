import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWalmartProduct } from '../../../../src/parsing/parsers/index.ts';
const url = 'https://www.walmart.ca/en/ip/sofa/4SV84AV3CA6F';
function parse(overrides: Record<string, unknown> = {}, requestedUrl = url) {
  const product = {
    usItemId: '4SV84AV3CA6F',
    name: 'HOMCOM Sofa',
    availabilityStatus: 'IN_STOCK',
    sellerName: 'Aosom Canada Inc',
    priceInfo: {
      currentPrice: { price: 584.97, currencyUnit: 'CAD' },
      wasPrice: { price: 869.99, currencyUnit: 'CAD' },
    },
    ...overrides,
  };
  const state = {
    props: {
      pageProps: {
        initialData: {
          data: { product, recommendations: [{ priceInfo: { wasPrice: { price: 9999 } } }] },
        },
      },
    },
  };
  return parseWalmartProduct({
    version: '1',
    url,
    requestedUrl,
    fetchedAt: '2026-10-09T00:00:00Z',
    html: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(state)}</script>`,
    markdown: '',
    metadata: {},
    jsonLd: [],
  });
}
test('Walmart reads current product and former price in cents, excluding recommendations', () => {
  const result = parse();
  assert.equal(result.status, 'parsed');
  assert.equal(result.products.length, 1);
  const offer = result.products[0].offers[0];
  assert.equal(offer.amountMinor, 58497);
  assert.equal(offer.compareAtAmountMinor, 86999);
  assert.equal(offer.currency, 'CAD');
  assert.equal(offer.seller, 'Aosom Canada Inc');
  assert.equal(offer.availability, 'InStock');
});
test('Walmart refuses wrong item, redirected item and conflicting currencies', () => {
  assert.equal(parse({ usItemId: 'OTHER' }).status, 'needs_review');
  assert.equal(parse({}, url.replace('4SV84AV3CA6F', 'OTHER')).status, 'needs_review');
  for (const field of ['currentPrice', 'wasPrice'] as const) {
    const prices = {
      currentPrice: { price: 584.97, currencyUnit: 'CAD' },
      wasPrice: { price: 869.99, currencyUnit: 'CAD' },
    };
    prices[field].currencyUnit = 'USD';
    assert.equal(parse({ priceInfo: prices }).status, 'needs_review');
  }
});
test('Walmart never invents former prices or swaps a lower former price with current price', () => {
  for (const wasPrice of [
    null,
    { price: 500, currencyUnit: 'CAD' },
    { price: 584.97, currencyUnit: 'CAD' },
  ]) {
    const result = parse({
      priceInfo: { currentPrice: { price: 584.97, currencyUnit: 'CAD' }, wasPrice },
    });
    assert.equal(result.status, 'parsed');
    assert.equal(result.products[0].offers[0].amountMinor, 58497);
    assert.equal(result.products[0].offers[0].compareAtAmountMinor, undefined);
  }
});
