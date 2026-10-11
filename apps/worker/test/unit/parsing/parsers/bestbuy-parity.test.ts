import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBestBuyProduct } from '../../../../src/parsing/parsers/retailers/bestbuy.ts';
import { canonicalProducts } from '../../../../src/parsing/parsers/shared/facts.ts';

// Real in-app (WebView) captures from the Mac, 2026-10-10/11 UTC; see the fixtures README.
const capture = (sku: string, url: string, fetchedAt: string) =>
  canonicalProducts(
    parseBestBuyProduct({
      version: '1',
      url,
      requestedUrl: url,
      fetchedAt,
      markdown: '',
      jsonLd: [],
      metadata: {},
      html: readFileSync(
        new URL(`../../../fixtures/retailers/bestbuy-webview-${sku}.html`, import.meta.url),
        'utf8',
      ),
    }),
  );
const deals = (offer: { promotions?: { type: string; text: string }[] }) =>
  (offer.promotions ?? []).map((p) => [p.type, p.text]);
const bbImage = /^https:\/\/multimedia\.bbycastatic\.ca\/multimedia\/products\/500x500\//;

test('page state (19968306): specs, category path, Top Deal badge, sale end, special offer, the EHF the page states', () => {
  const result = capture(
    '19968306',
    'https://www.bestbuy.ca/en-ca/product/google-pixel-watch-5-45mm-with-satin-pyrite-aluminum-case/19968306',
    '2026-10-10T21:46:34.282Z',
  );
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  const [product] = result.products;
  assert.deepEqual(product.rating, {
    value: 4.84,
    scale: 5,
    count: 19,
    evidence: 'window.__INITIAL_STATE__.product.product.customerRating',
  });
  assert.equal(product.brand, 'GOOGLE');
  assert.deepEqual(product.categories, [
    'Wearable Technology',
    'Smartwatches & Accessories',
    'Smartwatches',
  ]);
  assert.deepEqual(product.badges, ['Top Deal']);
  assert.deepEqual(product.specifications?.slice(0, 3), [
    { name: 'Model Number', value: 'GFW3R' },
    { name: 'Product Condition', value: 'Brand New' },
    { name: 'Case Colour', value: 'Satin Pyrite Aluminum' },
  ]);
  // Every photo at 500x500, the rendition Best Buy publishes for all (the state lists 1500x1500 for each).
  assert.equal(product.images.length, 22);
  assert.ok(product.images.every((image) => bbImage.test(image)));
  const [offer] = product.offers;
  assert.equal(offer.amountMinor, 50999);
  assert.equal(offer.compareAtAmountMinor, 58999);
  assert.equal(offer.condition, 'new');
  assert.equal(offer.seller, 'Best Buy Canada');
  assert.equal(offer.availability, 'InStock');
  // The state says ehf 0; the price block, for the shopper's province, states "Plus $0.95 EHF".
  assert.equal(offer.fee, '$0.95 environmental handling fee');
  assert.deepEqual(deals(offer), [
    ['sale', 'Sale'],
    [
      'other',
      'Get $200 off an eligible Google Pixel Watch 5 when you buy select Google Pixel 11 phones.*',
    ],
  ]);
  // The sale's end is exact; its SAVE $80 is regular − sale, already the struck price, so not restated.
  assert.equal(offer.promotions?.[0].validUntil, '2026-10-16T07:00:00.000Z');
  assert.equal(offer.promotions?.[0].amountOffMinor, undefined);
  assert.equal(offer.promotions?.[1].amountOffMinor, 20000);
  assert.equal(offer.promotions?.[1].promotionId, '10068608');
  // No delivery wording anywhere ("This will be delivered as early as tomorrow", free shipping over $35).
  assert.doesNotMatch(JSON.stringify(product.offers), /deliver|free shipping/i);
});

test('stale state after in-app navigation (17158465): the rendered page still gives sale end, model, path, badge, EHF', () => {
  const result = capture(
    '17158465',
    'https://www.bestbuy.ca/en-ca/product/frigidaire-24-54db-front-control-max-dry-dishwasher-energy-star-fdpc4314as-stainless-steel/17158465?source=pdpProdBox&adSlot=1&referrer=PDP%20Prod%20Box_Sponsor',
    '2026-10-11T01:07:22.396Z',
  );
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  const [product] = result.products;
  assert.equal(product.rating?.count, 2094);
  assert.deepEqual(product.specifications, [{ name: 'Model Number', value: 'FDPC4314AS' }]);
  assert.deepEqual(product.categories, [
    'Appliances',
    'Major Appliances',
    'Dishwashers',
    'Built-In Dishwashers',
  ]);
  assert.deepEqual(product.badges, ['Top Deal']);
  // This SKU has no 1500x1500 rendition (404, though the page lists it): only 500x500 is stored.
  assert.ok(product.images.length > 0);
  assert.ok(product.images.every((image) => bbImage.test(image)));
  const [offer] = product.offers;
  assert.equal(offer.amountMinor, 52599);
  assert.equal(offer.compareAtAmountMinor, 57999); // $525.99 + SAVE $54
  assert.equal(offer.fee, '$5.00 environmental handling fee');
  // "Sale ends: October 15, 2026*" on the page; its exact instant is the structured priceValidUntil.
  assert.deepEqual(
    offer.promotions?.map((p) => [p.type, p.text, p.validUntil, p.amountOffMinor]),
    [['sale', 'Sale', '2026-10-16T07:00:00.000Z', undefined]],
  );
  // The structured availability is null and the page states none: unknown, never guessed.
  assert.equal(offer.availability, undefined);
});

test('a stale page whose offer details are empty reads the buy box; no end shown, so no sale deal (20099717)', () => {
  const result = capture(
    '20099717',
    'https://www.bestbuy.ca/en-ca/product/asus-vivobook-15-15-6-60hz-laptop-intel-core-5-320-16gb-ram-512gb-ssd-windows-11-home-quiet-blue/20099717',
    '2026-10-11T01:05:08.736Z',
  );
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  const [offer] = result.products[0].offers;
  assert.equal(offer.amountMinor, 84999);
  assert.equal(offer.compareAtAmountMinor, 129999); // $849.99 + SAVE $450 in the buy box
  assert.equal(offer.fee, '$0.50 environmental handling fee');
  assert.deepEqual(offer.promotions ?? [], []);
  // Other products' tiles ("SAVE $80", "Top Deal") never count.
  assert.equal(result.products[0].badges, undefined);
});

test('JBL Flip 7 (19269668): "Available to ship" in its own price block is in stock', () => {
  const result = capture(
    '19269668',
    'https://www.bestbuy.ca/en-ca/product/jbl-flip-7-waterproof-bluetooth-wireless-speaker-black/19269668?icmp=ratings_reviews&referrer=Ratings+and+Review#reviews',
    '2026-10-11T01:05:23.042Z',
  );
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  const [offer] = result.products[0].offers;
  assert.equal(offer.amountMinor, 13999);
  assert.equal(offer.compareAtAmountMinor, 18999);
  assert.equal(offer.availability, 'InStock');
  assert.equal(offer.fee, '$0.95 environmental handling fee');
  assert.deepEqual(deals(offer), [['sale', 'Sale']]);
});
