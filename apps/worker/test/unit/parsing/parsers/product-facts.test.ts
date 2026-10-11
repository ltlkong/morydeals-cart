import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canonicalProducts,
  identityUrl,
  parseAmazonProduct,
  parseBestBuyProduct,
  parseShopifyProduct,
  parseWalmartProduct,
  schemaAvailability,
  type PageDocument,
} from '../../../../src/parsing/parsers/index.ts';
import { jsonLdStrategy } from '../../../../src/parsing/parsers/parser.ts';
const parseJsonLd = (document: PageDocument) => jsonLdStrategy.parse(document);
import {
  conditionInText,
  promotion,
  rating,
  schemaCondition,
  textRating,
} from '../../../../src/parsing/parsers/shared/facts.ts';
import { assignedJson, htmlDocument } from '../../../../src/parsing/parsers/shared/html.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../../fixtures/retailers/${name}.html`, import.meta.url), 'utf8');
const page = (url: string, extra: Partial<PageDocument> = {}): PageDocument => ({
  version: '1',
  url,
  requestedUrl: url,
  fetchedAt: '2026-10-10T00:00:00Z',
  markdown: '',
  jsonLd: [],
  metadata: {},
  ...extra,
});

test('availability names are schema.org ItemAvailability; anything unknown stays unknown', () => {
  assert.equal(schemaAvailability('https://schema.org/InStock'), 'InStock');
  assert.equal(schemaAvailability('http://schema.org/OutOfStock'), 'OutOfStock');
  assert.equal(schemaAvailability('SoldOut'), 'OutOfStock');
  assert.equal(schemaAvailability('LimitedAvailability'), 'LimitedAvailability');
  assert.equal(schemaAvailability('BackOrder'), 'BackOrder');
  assert.equal(schemaAvailability('PreSale'), 'PreOrder');
  assert.equal(schemaAvailability('maybe soon'), undefined);
  assert.equal(schemaAvailability(undefined), undefined);
});

test('condition comes only from a stated schema.org value or condition words', () => {
  assert.equal(schemaCondition('https://schema.org/NewCondition'), 'new');
  assert.equal(schemaCondition('UsedCondition'), 'used');
  assert.equal(schemaCondition('http://schema.org/RefurbishedCondition'), 'renewed');
  assert.equal(schemaCondition('DamagedCondition'), 'damaged');
  assert.equal(schemaCondition('Open Box'), 'open_box');
  assert.equal(schemaCondition('Excellent'), undefined);
  assert.equal(conditionInText('Apple iPhone 13 (Renewed)'), 'renewed');
  assert.equal(conditionInText('Open-Box Excellent'), 'open_box');
  assert.equal(conditionInText('Used - Like New'), 'used');
  assert.equal(conditionInText('Brand new in box'), undefined);
});

test('a promotion is shopper text only, with a code and end instant only when stated', () => {
  assert.deepEqual(
    promotion('coupon', ' Save $10 with coupon ', '#couponFeature', {
      code: 'FALL10',
      validUntil: '2026-10-12T06:59:59-07:00',
    }),
    {
      type: 'coupon',
      text: 'Save $10 with coupon',
      code: 'FALL10',
      amountOffMinor: 1000,
      validUntil: '2026-10-12T13:59:59.000Z',
      evidence: '#couponFeature',
    },
  );
  // A local date has no zone: it never becomes an instant.
  assert.equal(
    promotion('sale', 'Sale', 'x', { validUntil: '2026-10-07T00:00' })?.validUntil,
    undefined,
  );
  for (const junk of ['{"type":"sale"}', 'dealPrice: 12.99', '12.99', '', 'x'.repeat(201)])
    assert.equal(promotion('other', junk, 'x'), undefined, junk);
});

test('ratings are kept only within their scale; text ratings need both parts', () => {
  assert.deepEqual(rating({ value: '4.6', count: '1,284' }, 'e'), {
    value: 4.6,
    scale: 5,
    count: 1284,
    evidence: 'e',
  });
  assert.deepEqual(rating({ value: 8.4, scale: 10 }, 'e'), {
    value: 8.4,
    scale: 10,
    evidence: 'e',
  });
  assert.equal(rating({ value: 6 }, 'e'), undefined);
  assert.equal(rating({ value: 4, count: 0 }, 'e'), undefined);
  assert.deepEqual(textRating('4.5 out of 5 stars', '2,031 ratings', 'e'), {
    value: 4.5,
    scale: 5,
    count: 2031,
    evidence: 'e',
  });
  assert.equal(textRating('Be the first to review', undefined, 'e'), undefined);
});

test('identity URLs keep the variant and drop tracking, so one variant is one product', () => {
  assert.equal(
    identityUrl('https://ca.shokz.com/products/x?utm_source=ig&variant=123&fbclid=a#reviews'),
    'https://ca.shokz.com/products/x?variant=123',
  );
  assert.equal(
    identityUrl('https://shop.example/p/1?gclid=1&size=M&color=red'),
    'https://shop.example/p/1?size=M&color=red',
  );
  const result = canonicalProducts({
    parserVersion: 'test',
    status: 'parsed',
    strategy: 'x',
    issues: [],
    products: [
      {
        url: 'https://shop.example/p/1?color=red&utm_medium=email',
        title: 'Tee',
        images: [],
        evidence: 'e',
        offers: [
          {
            amountMinor: 100,
            currency: 'CAD',
            currencyEvidence: 'e',
            availability: 'https://schema.org/InStock',
            promotions: [
              { type: 'deal', text: 'Limited time deal', evidence: 'a' },
              { type: 'deal', text: 'Limited time deal', evidence: 'b' },
            ],
            evidence: 'e',
          },
        ],
      },
    ],
  });
  const product = result.products[0];
  assert.equal(product.url, 'https://shop.example/p/1?color=red');
  assert.equal(product.offers[0].availability, 'InStock');
  assert.equal(product.offers[0].promotions?.length, 1);
});

// A ProductGroup page (schema.org hasVariant) for the selected size=M variant.
const groupPage = (url: string) =>
  page(url, {
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'ProductGroup',
        name: 'Merino Crew',
        productGroupID: 'CREW',
        variesBy: ['https://schema.org/size', 'https://schema.org/color'],
        aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.7', reviewCount: 312 },
        hasVariant: [
          {
            '@type': 'Product',
            sku: 'CREW-S-NVY',
            name: 'Merino Crew - S / Navy',
            size: 'S',
            color: 'Navy',
            url: 'https://shop.example/crew?size=S',
            offers: {
              '@type': 'Offer',
              price: '79.00',
              priceCurrency: 'CAD',
              availability: 'https://schema.org/InStock',
              itemCondition: 'https://schema.org/NewCondition',
            },
          },
          {
            '@type': 'Product',
            sku: 'CREW-M-NVY',
            name: 'Merino Crew - M / Navy',
            size: 'M',
            color: 'Navy',
            url: 'https://shop.example/crew?size=M',
            offers: {
              '@type': 'Offer',
              price: '89.00',
              priceCurrency: 'CAD',
              availability: 'https://schema.org/BackOrder',
              itemCondition: 'https://schema.org/RefurbishedCondition',
            },
          },
        ],
      },
    ],
  });

test('JSON-LD ProductGroup: the selected variant, its own price, stock and condition, the group rating', () => {
  const result = parseJsonLd(groupPage('https://shop.example/crew?size=M&utm_source=x'));
  assert.equal(result.status, 'parsed');
  const product = result.products.find((p) => p.sku === 'CREW-M-NVY');
  assert.ok(product);
  assert.equal(product.offers.length, 1);
  assert.equal(product.offers[0].amountMinor, 8900);
  assert.equal(product.offers[0].availability, 'BackOrder');
  assert.equal(product.offers[0].condition, 'renewed');
  assert.deepEqual(
    product.variant?.options.map((o) => [o.name, o.value]),
    [
      ['Size', 'M'],
      ['Color', 'Navy'],
    ],
  );
  assert.equal(product.variant?.label, 'M · Navy');
  assert.equal(product.rating?.value, 4.7);
  assert.equal(product.rating?.count, 312);
});

test('Amazon reads rating, clip coupon and limited-time deal beside the featured new offer', () => {
  const html = fixture('amazon-single-B0FF3549YB')
    .replace(
      '<body',
      '<div id="averageCustomerReviews"><span id="acrPopover" title="4.4 out of 5 stars"></span><span id="acrCustomerReviewText">1,935 ratings</span></div><div id="dealBadge_feature_div"><span id="dealBadgeSupportingText">Limited time deal</span></div><body',
    )
    .replace(
      'id="availability"',
      'id="availability"><span id="couponFeature">Save $5.00 with coupon Terms</span><span hidden',
    );
  const result = parseAmazonProduct(page('https://www.amazon.ca/dp/B0FF3549YB', { html }));
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  const [product] = result.products;
  assert.deepEqual(
    { value: product.rating?.value, count: product.rating?.count, scale: product.rating?.scale },
    { value: 4.4, count: 1935, scale: 5 },
  );
  const offer = product.offers[0];
  assert.equal(offer.condition, 'new');
  assert.deepEqual(
    offer.promotions?.map((p) => [p.type, p.text]),
    [
      ['coupon', 'Save $5.00 with coupon'],
      ['deal', 'Limited time deal'],
    ],
  );
  // The fixture as captured shows no deal, rating or coupon: nothing is invented.
  const plain = parseAmazonProduct(
    page('https://www.amazon.ca/dp/B0FF3549YB', { html: fixture('amazon-single-B0FF3549YB') }),
  ).products[0];
  assert.equal(plain.rating, undefined);
  assert.equal(plain.offers[0].promotions, undefined);
});

test('Amazon reads the selected twister dimensions as the variant', () => {
  const result = parseAmazonProduct(
    page('https://www.amazon.ca/dp/B0CTMRXCTG', { html: fixture('amazon-price-table-B0CTMRXCTG') }),
  );
  assert.equal(result.status, 'parsed');
  assert.equal(result.products[0].variant?.id, 'B0CTMRXCTG');
  assert.equal(result.products[0].variant?.label, 'White · 2 Camera');
});

test('Best Buy reads the selected variant, customer rating and a sale with its end', () => {
  const url = 'https://www.bestbuy.ca/en-ca/product/19190432';
  const html = fixture('bestbuy-iphone16e-19190432');
  const result = parseBestBuyProduct(page(url, { html }));
  assert.equal(result.status, 'parsed');
  const [product] = result.products;
  assert.equal(product.variant?.label, 'Unlocked · 128 · Black');
  assert.deepEqual(product.variant?.options[2], { name: 'Colour', value: 'Black' });
  assert.equal(product.rating?.value, 4.45);
  assert.equal(product.rating?.count, 20);
  assert.equal(product.offers[0].availability, 'OutOfStock');
  assert.equal(product.offers[0].condition, 'new');
  assert.equal(product.offers[0].promotions, undefined);

  const state = assignedJson(htmlDocument(html), '__INITIAL_STATE__') as {
    product: { product: Record<string, unknown> };
  };
  Object.assign(state.product.product, {
    isOnSale: true,
    salePrice: 799.99,
    saleEndDate: Date.parse('2026-10-13T06:59:00Z'),
  });
  const sale = parseBestBuyProduct(
    page(url, { html: `<script>window.__INITIAL_STATE__ = ${JSON.stringify(state)};</script>` }),
  );
  assert.equal(sale.status, 'parsed', sale.issues.join('; '));
  assert.deepEqual(sale.products[0].offers[0].promotions, [
    {
      type: 'sale',
      text: 'Sale',
      validUntil: '2026-10-13T06:59:00.000Z',
      evidence: 'window.__INITIAL_STATE__.product.product.isOnSale',
    },
  ]);
});

test('Walmart reads selected variant criteria, rating and Rollback/Clearance flags', () => {
  const url = 'https://www.walmart.ca/en/ip/sofa/4SV84AV3CA6F';
  const product = {
    usItemId: '4SV84AV3CA6F',
    name: 'HOMCOM Sofa',
    availabilityStatus: 'IN_STOCK',
    averageRating: 4.2,
    numberOfReviews: 57,
    variantCriteria: [
      {
        name: 'Colour',
        variantList: [
          { name: 'Grey', selected: true },
          { name: 'Beige', selected: false },
        ],
      },
    ],
    priceInfo: {
      currentPrice: { price: 584.97, currencyUnit: 'CAD' },
      wasPrice: { price: 869.99, currencyUnit: 'CAD' },
      priceDisplayCodes: { rollback: true, clearance: false },
    },
  };
  const state = { props: { pageProps: { initialData: { data: { product } } } } };
  const result = parseWalmartProduct(
    page(url, {
      html: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(state)}</script>`,
    }),
  );
  assert.equal(result.status, 'parsed');
  const [parsed] = result.products;
  assert.equal(parsed.variant?.label, 'Grey');
  assert.equal(parsed.rating?.value, 4.2);
  assert.equal(parsed.rating?.count, 57);
  assert.deepEqual(
    parsed.offers[0].promotions?.map((p) => p.text),
    ['Rollback'],
  );
});

test('Shopify Liquid names the selected options from the product JSON', () => {
  const variant = {
    id: 123,
    title: 'Pink / Standard',
    name: 'Headphones - Pink / Standard',
    sku: 'PINK-CA',
    price: 19995,
    available: true,
    options: ['Pink', 'Standard'],
  };
  const result = parseShopifyProduct(
    page('https://ca.shokz.com/products/headphones?variant=123', {
      metadata: { 'og:price:currency': ['CAD'] },
      jsonLd: [
        {
          '@type': 'Product',
          name: 'Headphones',
          url: '/products/headphones',
          aggregateRating: { ratingValue: 4.8, reviewCount: 96 },
          offers: [
            { price: '199.95', priceCurrency: 'CAD', url: '/products/headphones?variant=123' },
          ],
        },
      ],
      embeddedProducts: [
        { kind: 'selected-variant', source: 'script[0]', value: variant },
        {
          kind: 'product',
          source: 'script[1]',
          value: { handle: 'headphones', options: ['Colour', 'Size'], variants: [variant] },
        },
      ],
    }),
  );
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  const [product] = result.products;
  assert.deepEqual(product.variant, {
    id: '123',
    label: 'Pink · Standard',
    options: [
      { name: 'Colour', value: 'Pink' },
      { name: 'Size', value: 'Standard' },
    ],
    evidence: product.variant?.evidence,
  });
  assert.equal(product.rating?.value, 4.8);
});
