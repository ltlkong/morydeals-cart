import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseShopifyProduct,
  normalizeLlmProduct,
  productPrompt,
  type PageDocument,
} from '../../../../src/parsing/parsers/index.ts';

const variant = {
  id: 123,
  title: 'Pink',
  name: 'Headphones - Pink',
  sku: 'PINK-CA',
  price: 19995,
  compare_at_price: 24995,
  available: true,
  featured_image: { src: '//ca.shokz.com/pink.webp' },
};
const document: PageDocument = {
  version: '1',
  url: 'https://ca.shokz.com/products/headphones?variant=123',
  fetchedAt: '2026-10-09T00:00:00Z',
  markdown: '# Headphones\nRegular price $199.95\n\nRegular price ~~$249.95~~ Sale price $199.95',
  metadata: { 'og:price:currency': ['CAD'] },
  jsonLd: [
    {
      '@type': 'Product',
      name: 'Headphones',
      url: '/products/headphones',
      brand: { name: 'Shokz' },
      offers: [
        {
          price: '199.95',
          priceCurrency: 'CAD',
          url: '/products/headphones?variant=123',
        },
        {
          price: '149.95',
          priceCurrency: 'CAD',
          url: '/products/headphones?variant=456',
        },
      ],
    },
  ],
  embeddedProducts: [{ kind: 'selected-variant', source: 'script[0]', value: variant }],
};

test('Shopify selects the exact variant with its own SKU, image, stock and presentment quote', () => {
  const result = parseShopifyProduct(document);
  assert.equal(result.status, 'parsed');
  const p = result.products[0];
  assert.equal(p.variantId, '123');
  assert.equal(p.sku, 'PINK-CA');
  assert.deepEqual(p.images, ['https://ca.shokz.com/pink.webp']);
  assert.equal(p.title, 'Headphones - Pink');
  assert.equal(p.offers[0].amountMinor, 19995);
  assert.equal(p.offers[0].compareAtAmountMinor, 24995);
  assert.equal(p.offers[0].availability, 'InStock');
  assert.equal(p.offers[0].currency, 'CAD');
  const soldOut = structuredClone(document);
  soldOut.embeddedProducts![0].value = {
    ...variant,
    available: false,
    compare_at_price: null,
  };
  assert.equal(parseShopifyProduct(soldOut).products[0].offers[0].availability, 'OutOfStock');
  assert.equal(parseShopifyProduct(soldOut).products[0].offers[0].compareAtAmountMinor, undefined);
});

test('Shopify fails closed on missing variant, conflicting prices, invalid currency or snapshots', () => {
  assert.equal(
    parseShopifyProduct({
      ...document,
      url: document.url.replace('123', '456'),
    }).status,
    'needs_review',
  );
  const conflict = structuredClone(document);
  conflict.embeddedProducts!.push({
    kind: 'selected-variant',
    source: 'other',
    value: { ...variant, price: 29995 },
  });
  assert.equal(parseShopifyProduct(conflict).status, 'needs_review');
  conflict.embeddedProducts!.shift();
  assert.equal(parseShopifyProduct(conflict).status, 'needs_review');
  assert.equal(
    parseShopifyProduct({
      ...document,
      jsonLd: [],
      metadata: { 'og:price:currency': ['BAD'] },
    }).status,
    'needs_review',
  );
});

test('full product JSON never selects the first sibling; zero-decimal currencies normalize exactly', () => {
  const page = {
    ...document,
    url: 'https://shop.example/products/headphones?variant=123',
    jsonLd: [],
    metadata: { 'og:price:currency': ['JPY'] },
    embeddedProducts: [
      {
        kind: 'product' as const,
        source: 'product',
        value: {
          id: 99,
          handle: 'headphones',
          title: 'Headphones',
          variants: [
            { ...variant, id: 456 },
            { ...variant, price: 19900, compare_at_price: 24900 },
          ],
        },
      },
    ],
  };
  assert.equal(parseShopifyProduct(page).products[0].offers[0].amountMinor, 199);
  assert.equal(
    parseShopifyProduct({
      ...page,
      url: 'https://shop.example/products/headphones',
    }).status,
    'needs_review',
  );
  assert.equal(
    parseShopifyProduct({
      ...page,
      url: 'https://shop.example/products/another?variant=123',
    }).status,
    'needs_review',
  );
});

test('LLM variant fields are grounded by the selected snapshot; different sibling prices are rejected', () => {
  const data = {
    product: {
      title: 'Headphones',
      brand: null,
      sku: null,
      images: [],
      offers: [
        {
          amountMinor: 19995,
          currency: 'CAD',
          priceText: '$199.95',
          evidence: 'Regular price $199.95',
          compareAt: {
            amountMinor: 24995,
            priceText: '$249.95',
            evidence: 'Regular price ~~$249.95~~ Sale price $199.95',
          },
        },
      ],
    },
  };
  const result = normalizeLlmProduct(JSON.stringify(data), document, 'fixture');
  assert.equal(result.status, 'parsed');
  assert.equal(result.products[0].sku, 'PINK-CA');
  assert.deepEqual(result.products[0].images, ['https://ca.shokz.com/pink.webp']);
  assert.equal(result.products[0].offers[0].evidence, 'Sale price $199.95');
  assert.match(productPrompt(document).messages[1].content, /selectedVariant/);
  data.product.offers[0].amountMinor = 14995;
  assert.equal(
    normalizeLlmProduct(JSON.stringify(data), document, 'fixture').status,
    'needs_review',
  );
});

test('Shopify Liquid retains the current offer when its former price is lower', () => {
  const doc = structuredClone(document);
  doc.embeddedProducts![0].value = { ...variant, compare_at_price: 14995 };
  const result = parseShopifyProduct(doc);
  assert.equal(result.status, 'parsed');
  assert.equal(result.products[0].offers[0].amountMinor, 19995);
  assert.equal(result.products[0].offers[0].compareAtAmountMinor, undefined);
  assert.equal(result.products[0].offers[0].compareAtEvidence, undefined);
  assert.ok(result.issues.some((issue) => issue.includes('below current price')));
});

// Roborock's theme ships no product JSON; its JSON-LD has the single variant.
const singleVariant = (
  offers: object[],
  url = 'https://ca.roborock.com/products/roborock-saros-20',
) =>
  parseShopifyProduct({
    version: '1',
    url,
    fetchedAt: '2026-10-10T00:00:00Z',
    markdown: '# Roborock Saros 20',
    metadata: {},
    jsonLd: [
      {
        '@type': 'Product',
        name: 'Roborock Saros 20',
        url: '/products/roborock-saros-20',
        image: 'https://ca.roborock.com/cdn/shop/files/saros-20.png',
        brand: { '@type': 'Brand', name: 'Roborock' },
        offers,
      },
    ],
    embeddedProducts: [],
  });
const offer = {
  '@type': 'Offer',
  url: '/products/roborock-saros-20?variant=47817446981799',
  price: '1699.99',
  priceCurrency: 'CAD',
  availability: 'https://schema.org/InStock',
};

test('a single-variant Shopify product without product JSON is read from its one JSON-LD offer', () => {
  const result = singleVariant([offer]);
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  const [product] = result.products;
  assert.equal(product.variantId, '47817446981799');
  assert.equal(
    product.url,
    'https://ca.roborock.com/products/roborock-saros-20?variant=47817446981799',
  );
  assert.equal(product.offers[0].amountMinor, 169999);
  assert.equal(product.offers[0].availability, 'InStock');
  assert.deepEqual(product.images, ['https://ca.roborock.com/cdn/shop/files/saros-20.png']);
  // Several variants without a selection stay ambiguous.
  const many = singleVariant([offer, { ...offer, url: '/products/roborock-saros-20?variant=2' }]);
  assert.equal(many.status, 'needs_review');
  // A requested variant must be the offer's own.
  const other = singleVariant(
    [offer],
    'https://ca.roborock.com/products/roborock-saros-20?variant=9',
  );
  assert.equal(other.status, 'needs_review');
});

test('a Shopify page outside /products/ is reported as not a product page', () => {
  const result = singleVariant([], 'https://ca.roborock.com/pages/roborock-saros-20');
  assert.deepEqual(result.issues, ['Not a Shopify product page']);
});

test('a Shopify gallery is the variant photo and the shared photos, never another colour', () => {
  const blue = {
    ...variant,
    id: 456,
    title: 'Blue',
    featured_image: { src: '//ca.shokz.com/blue.webp' },
  };
  const result = parseShopifyProduct({
    ...document,
    embeddedProducts: [
      ...document.embeddedProducts!,
      {
        kind: 'product',
        source: 'product',
        value: {
          id: 99,
          handle: 'headphones',
          title: 'Headphones',
          variants: [variant, blue],
          images: [
            '//ca.shokz.com/pink.webp',
            '//ca.shokz.com/blue.webp',
            '//ca.shokz.com/side.webp',
            '//ca.shokz.com/box.webp',
          ],
        },
      },
    ],
  });
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  assert.deepEqual(result.products[0].images, [
    'https://ca.shokz.com/pink.webp',
    'https://ca.shokz.com/side.webp',
    'https://ca.shokz.com/box.webp',
  ]);
});

test('a single-variant JSON-LD product keeps every image', () => {
  const result = singleVariant([offer]);
  assert.equal(result.products[0].images.length, 1);
  const many = parseShopifyProduct({
    version: '1',
    url: 'https://ca.roborock.com/products/roborock-saros-20',
    fetchedAt: '2026-10-10T00:00:00Z',
    markdown: '',
    metadata: {},
    jsonLd: [
      {
        '@type': 'Product',
        name: 'Roborock Saros 20',
        url: '/products/roborock-saros-20',
        image: ['https://ca.roborock.com/a.png', 'https://ca.roborock.com/b.png'],
        offers: [offer],
      },
    ],
    embeddedProducts: [],
  });
  assert.deepEqual(many.products[0].images, [
    'https://ca.roborock.com/a.png',
    'https://ca.roborock.com/b.png',
  ]);
});
