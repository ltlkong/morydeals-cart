import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canonicalProducts,
  parseAmazonProduct,
  parseBestBuyProduct,
  type PageDocument,
} from '../../../../src/parsing/parsers/index.ts';
import { promotion, statedOff } from '../../../../src/parsing/parsers/shared/facts.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../../fixtures/retailers/${name}.html`, import.meta.url), 'utf8');
// The four real mobile captures (parser 3.16.0 stored one offer each and dropped everything below).
const capture = (asin: string, fetchedAt: string) => {
  const url = `https://www.amazon.ca/dp/${asin}/ref=sspa_mw_detail_0?ie=UTF8&psc=1`;
  const document: PageDocument = {
    version: '1',
    url,
    requestedUrl: url,
    fetchedAt,
    markdown: '',
    jsonLd: [],
    metadata: {},
    html: fixture(`amazon-mobile-parity-${asin}`),
  };
  const result = canonicalProducts(parseAmazonProduct(document));
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  return result.products[0];
};
const deals = (offer: { promotions?: { type: string; text: string }[] }) =>
  (offer.promotions ?? []).map((p) => [p.type, p.text]);

test('the price-block clip coupon is the featured offer’s, with its percent and promotion id', () => {
  const kit = capture('B0GHY558KL', '2026-10-11T00:27:07.902Z');
  assert.equal(kit.offers.length, 1);
  const [coupon] = kit.offers[0].promotions ?? [];
  assert.equal(coupon.type, 'coupon');
  assert.equal(coupon.text, 'Apply 15% coupon');
  assert.equal(coupon.percentOff, 15);
  assert.equal(coupon.promotionId, 'AK2WXDI4S0N04');
  // Sponsored cards' coupons ("You pay $28.49 with coupon", other ASINs) are not this product's.
  assert.equal(kit.offers[0].promotions?.length, 1);
});

test('product-level facts the mobile page states: rating link, brand, badge, sales signal, categories, specs', () => {
  const saros = capture('B0G64MM1HM', '2026-10-11T00:26:05.318Z');
  assert.deepEqual(
    { value: saros.rating?.value, scale: saros.rating?.scale, count: saros.rating?.count },
    { value: 4.2, scale: 5, count: 633 },
  );
  assert.equal(saros.brand, 'roborock');
  assert.deepEqual(saros.badges, ["Amazon's Choice"]);
  assert.equal(saros.boughtRecently, '100+ bought in past month');
  assert.deepEqual(saros.categories, [
    'Home & Kitchen',
    'Vacuums & Floor Care',
    'Vacuums',
    'Robotic Vacuums',
  ]);
  assert.deepEqual(saros.specifications?.slice(0, 2), [
    { name: 'Brand', value: 'roborock' },
    { name: 'Model name', value: 'Saros 20' },
  ]);
  const kit = capture('B0GHY558KL', '2026-10-11T00:27:07.902Z');
  assert.equal(kit.brand, 'GleamGlee'); // "Brand: GleamGlee" byline
  assert.equal(kit.badges, undefined);
  assert.equal(kit.rating?.count, 93);
});

test('offer facts: the reference caption and stated savings, ships from, delivery; the deal badge kept', () => {
  const saros = capture('B0G64MM1HM', '2026-10-11T00:26:05.318Z');
  const [offer] = saros.offers;
  assert.equal(offer.amountMinor, 169999);
  assert.equal(offer.compareAtAmountMinor, 229999);
  assert.equal(offer.compareAtLabel, 'Was');
  assert.equal(offer.shipsFrom, 'Amazon');
  assert.equal(offer.seller, 'Roborock Technology Co. Ltd');
  assert.equal(offer.delivery, 'FREE delivery Monday, October 19');
  assert.deepEqual(deals(offer), [
    ['deal', 'Limited-time deal'],
    ['sale', 'Was $2,299.99'],
  ]);
  assert.equal(offer.promotions?.[0].kind, 'limited_time');
  // The badge's countdown is an unfilled template: no end is invented.
  assert.equal(offer.promotions?.[0].validUntil, undefined);
  assert.equal(offer.promotions?.[1].percentOff, 26); // the page's own "-26%"
  const kit = capture('B0GHY558KL', '2026-10-11T00:27:07.902Z');
  assert.equal(
    kit.offers[0].delivery,
    'FREE delivery Monday, October 19 on orders shipped by Amazon over $35',
  );
  assert.equal(kit.offers[0].compareAtLabel, undefined);
});

test('a page that only counts other sellers keeps the count and lowest price, never invented offers', () => {
  const qrevo = capture('B0GXF7ZQPY', '2026-10-11T00:25:25.940Z');
  assert.equal(qrevo.offers.length, 1);
  assert.deepEqual(qrevo.offerSummary, {
    count: 3,
    condition: 'new',
    fromMinor: 69999,
    currency: 'CAD',
    text: 'Compare New (3) from $699.99',
  });
  for (const asin of ['B0G64MM1HM', 'B0GHY558KL', 'B0FDX5HY4G'])
    assert.equal(capture(asin, '2026-10-11T00:26:00Z').offerSummary, undefined);
});

test('desktop: the price block promotion message is the featured offer’s; the eco fee is the offer’s', () => {
  const url = 'https://www.amazon.ca/dp/B0BGJT87N2';
  const result = canonicalProducts(
    parseAmazonProduct({
      version: '1',
      url,
      requestedUrl: url,
      fetchedAt: '2026-10-10T00:00:00Z',
      markdown: '',
      jsonLd: [],
      metadata: {},
      html: fixture('amazon-deal-B0BGJT87N2'),
    }),
  );
  const [offer] = result.products[0].offers;
  assert.deepEqual(deals(offer), [
    ['deal', 'Limited-time deal'],
    ['other', '90 days free of Amazon Music with purchase'],
    ['sale', 'Was $119.96'],
  ]);
  assert.equal(offer.fee, '$0.55 eco fee might apply');
});

test('stated amounts off and kinds come from the words only', () => {
  assert.deepEqual(statedOff('Apply 15% coupon'), { percentOff: 15 });
  assert.deepEqual(statedOff('Save $5.00 with coupon'), { amountOffMinor: 500 });
  assert.deepEqual(statedOff('$10 off'), { amountOffMinor: 1000 });
  assert.deepEqual(statedOff('You pay $28.49 with coupon'), {});
  assert.deepEqual(statedOff('Limited-time deal'), {});
  assert.equal(promotion('other', 'Save $10 promo code: TPLINK10OFF', 'x')?.type, 'promo_code');
  assert.equal(promotion('other', 'Save $10 promo code: TPLINK10OFF', 'x')?.code, 'TPLINK10OFF');
  assert.equal(promotion('other', 'Save 5% on 2 select items', 'x')?.type, 'multi_buy');
  assert.equal(promotion('deal', 'Prime Day Deal', 'x')?.kind, 'prime_day');
  assert.equal(promotion('deal', 'Prime exclusive deal', 'x')?.kind, 'prime_exclusive');
});

test('Best Buy: the stated SAVE amount, clearance and model number', () => {
  const html = fixture('bestbuy-iphone16e-19190432')
    .replace('"isOnSale": false, "saving": 0', '"isOnSale": true, "saving": 70')
    .replace(
      '"priceWithoutEhf": 869.99, "priceWithEhf": 869.99',
      '"salePrice": 799.99, "priceWithoutEhf": 799.99, "priceWithEhf": 799.99',
    )
    .replace('"isClearance": false', '"isClearance": true');
  const url = 'https://www.bestbuy.ca/en-ca/product/apple-iphone-16e-128gb-black-unlocked/19190432';
  const result = canonicalProducts(
    parseBestBuyProduct({
      version: '1',
      url,
      requestedUrl: url,
      fetchedAt: '2026-10-10T00:00:00Z',
      markdown: '',
      jsonLd: [],
      metadata: {},
      html,
    }),
  );
  const product = result.products[0];
  assert.deepEqual(product.specifications, [{ name: 'Model Number', value: 'MD1F4VC/A' }]);
  const offer = product.offers[0];
  assert.deepEqual(
    offer.promotions?.map((p) => [p.type, p.text, p.amountOffMinor]),
    [
      ['sale', 'Sale', 7000],
      ['sale', 'Clearance', undefined],
    ],
  );
});
