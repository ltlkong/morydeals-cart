import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProductDocument, type PageDocument } from '../../../../src/parsing/parsers/index.ts';
const page = (jsonLd: unknown[] = [], metadata: Record<string, string[]> = {}): PageDocument => ({
  version: '1',
  url: 'https://shop.example/item',
  fetchedAt: '2026-10-09T00:00:00Z',
  markdown: '# Item\n$20 fake arbitrary text',
  jsonLd,
  metadata,
});
const product = (offers: unknown) => ({
  '@type': 'Product',
  name: 'Headphones',
  sku: 'sku1',
  image: '/image.png',
  offers,
});

test('resolves graph references and preserves decimal precision and currency', () => {
  const result = parseProductDocument(
    page([
      {
        '@graph': [
          product({ '@id': '#offer' }),
          {
            '@type': 'Offer',
            '@id': '#offer',
            price: '00129.9500',
            priceCurrency: 'CAD',
            availability: 'https://schema.org/InStock',
          },
        ],
      },
    ]),
  );
  assert.equal(result.status, 'parsed');
  assert.equal(result.strategy, 'schema-org');
  assert.equal(result.products[0].offers[0].amountMinor, 12995);
  assert.equal(result.products[0].offers[0].currency, 'CAD');
  assert.equal(result.products[0].images[0], 'https://shop.example/image.png');
  assert.equal('coupons' in result.products[0], false);
});
test('does not guess currencies or scrape a random markdown number', () => {
  const result = parseProductDocument(page([product({ price: '20' })]));
  assert.equal(result.status, 'needs_review');
  assert.deepEqual(result.products[0].offers, []);
  assert.equal(parseProductDocument(page()).products.length, 0);
});
test('metadata fallback requires explicit product evidence and a concrete price', () => {
  const result = parseProductDocument(
    page([], {
      'og:type': ['product'],
      'og:title': ['Tea'],
      'product:price:amount': ['12.5'],
      'product:price:currency': ['GBP'],
    }),
  );
  assert.equal(result.strategy, 'open-graph');
  assert.equal(result.status, 'parsed');
  assert.equal('coupons' in result.products[0], false);
  assert.equal(parseProductDocument(page([], { 'og:title': ['Article'] })).products.length, 0);
});
test('aggregate price ranges are not treated as a purchasable quote', () => {
  assert.equal(
    parseProductDocument(
      page([
        product({
          '@type': 'AggregateOffer',
          lowPrice: '10',
          highPrice: '99',
          priceCurrency: 'USD',
        }),
      ]),
    ).status,
    'needs_review',
  );
});
test('retains separate SKU variants and concrete offers in a ProductGroup', () => {
  const result = parseProductDocument(
    page([
      {
        '@type': 'ProductGroup',
        hasVariant: [
          {
            ...product({ price: '199', priceCurrency: 'JPY' }),
            url: '/item?variant=1',
          },
          {
            ...product([
              { price: '20', priceCurrency: 'CAD' },
              { price: '15', priceCurrency: 'USD' },
            ]),
            sku: 'sku2',
            url: '/item?variant=2',
          },
        ],
      },
    ]),
  );
  assert.equal(result.products.length, 2);
  assert.equal(result.products[1].offers.length, 2);
});
test('selects exact page identity and rejects ambiguous unrelated products', () => {
  const p = product({ price: '20', priceCurrency: 'CAD' });
  assert.equal(
    parseProductDocument(
      page([
        { ...p, url: '/other' },
        { ...p, url: '/third' },
      ]),
    ).status,
    'needs_review',
  );
  const matched = parseProductDocument(
    page([
      { ...p, url: '/other' },
      { ...p, url: '/item' },
    ]),
  );
  assert.equal(matched.products.length, 1);
  assert.equal(matched.products[0].url, 'https://shop.example/item');
});
test('supports site strategies without Node or DOM dependencies', () => {
  const result = parseProductDocument(page(), [
    {
      id: 'my-site',
      parse: () => ({
        parserVersion: 'adapter-1',
        strategy: 'my-site',
        status: 'needs_review',
        products: [],
        issues: ['no match'],
      }),
    },
  ]);
  assert.equal(result.status, 'needs_review');
  assert.ok(result.issues.includes('no match'));
});

test('keeps strikethrough price on the same offer and never uses it as current price', () => {
  const priceSpecification = [
    {
      '@type': 'UnitPriceSpecification',
      price: '429.99',
      priceCurrency: 'CAD',
      priceType: 'https://schema.org/StrikethroughPrice',
    },
  ];
  const result = parseProductDocument(
    page([product({ price: '89.99', priceCurrency: 'CAD', priceSpecification })]),
  );
  assert.equal(result.products[0].offers.length, 1);
  assert.equal(result.products[0].offers[0].amountMinor, 8999);
  assert.equal(result.products[0].offers[0].compareAtAmountMinor, 42999);
  assert.match(result.products[0].offers[0].compareAtEvidence!, /priceSpecification/);
  assert.equal(
    parseProductDocument(page([product({ priceSpecification })])).status,
    'needs_review',
  );
});

test('known storefront currency is a fallback; explicit currency takes priority', () => {
  const walmart = {
    ...page([product({ price: '89.99' })]),
    url: 'https://www.walmart.ca/en/ip/test',
  };
  assert.equal(parseProductDocument(walmart).products[0].offers[0].currency, 'CAD');
  assert.equal(
    parseProductDocument({
      ...walmart,
      jsonLd: [product({ price: '89.99', priceCurrency: 'USD' })],
    }).products[0].offers[0].currency,
    'USD',
  );
  for (const url of ['https://walmart.ca.example.org/item', 'https://another.example/item'])
    assert.equal(parseProductDocument({ ...walmart, url }).status, 'needs_review');
});

test('zero structured prices require review rather than becoming a free product', () => {
  const result = parseProductDocument(page([product({ price: 0, priceCurrency: 'CAD' })]));
  assert.equal(result.status, 'needs_review');
  assert.equal(result.products[0]?.offers.length, 0);
});
