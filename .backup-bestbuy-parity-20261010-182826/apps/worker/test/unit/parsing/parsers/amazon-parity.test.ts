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

test('offer facts: the reference caption and stated savings on the offer, ships from; no delivery; the deal badge kept', () => {
  const saros = capture('B0G64MM1HM', '2026-10-11T00:26:05.318Z');
  const [offer] = saros.offers;
  assert.equal(offer.amountMinor, 169999);
  assert.equal(offer.compareAtAmountMinor, 229999);
  assert.equal(offer.compareAtLabel, 'Was');
  assert.equal(offer.shipsFrom, 'Amazon');
  assert.equal(offer.seller, 'Roborock Technology Co. Ltd');
  // Delivery wording is never recorded, as a field or as a deal.
  assert.equal('delivery' in offer, false);
  // The struck price's "-26%" is the offer's own savings, not a separate "Was $2,299.99" deal.
  assert.equal(offer.savingsPercent, 26);
  assert.deepEqual(deals(offer), [['deal', 'Limited-time deal']]);
  assert.equal(offer.promotions?.[0].kind, 'limited_time');
  // The badge's countdown is an unfilled template: no end is invented.
  assert.equal(offer.promotions?.[0].validUntil, undefined);
  const kit = capture('B0GHY558KL', '2026-10-11T00:27:07.902Z');
  assert.equal('delivery' in kit.offers[0], false);
  assert.equal(
    JSON.stringify(kit).includes('FREE delivery'),
    false,
    'no delivery text anywhere in the product',
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
  ]);
  assert.equal(offer.compareAtLabel, 'Was');
  assert.equal(offer.savingsPercent, 25);
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

test('delivery wording is never a deal', () => {
  assert.equal(promotion('other', 'FREE delivery Monday, October 19', 'x'), undefined);
  assert.equal(promotion('other', 'FREE Shipping on orders over $35', 'x'), undefined);
  assert.equal(
    promotion('other', 'Or fastest delivery Monday. Order within 6 hrs', 'x'),
    undefined,
  );
  assert.equal(promotion('coupon', 'Apply 15% coupon', 'x')?.percentOff, 15);
});

test('Prime member price (real capture B0BWDNXK3Q): its own member offer; the regular $219.00 stays primary', () => {
  const url = 'https://www.amazon.ca/dp/B0BWDNXK3Q/ref=syn_sd_onsite_mobileweb_0?ie=UTF8&psc=1';
  const result = canonicalProducts(
    parseAmazonProduct({
      version: '1',
      url,
      requestedUrl: url,
      fetchedAt: '2026-10-11T00:49:49.575Z',
      markdown: '',
      jsonLd: [],
      metadata: {},
      html: fixture('amazon-mobile-prime-B0BWDNXK3Q'),
    }),
  );
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  const [regular, member, ...rest] = result.products[0].offers;
  assert.equal(rest.length, 0);
  // The "Non-Deal Price" row: what everyone pays, the primary and its series.
  assert.equal(regular.amountMinor, 21900);
  assert.equal(regular.purchaseType, undefined);
  assert.equal(regular.seller, 'Pmnianhua furniture');
  // Its old "Prime Member Price" caption belongs to the member row, not the regular price.
  assert.deepEqual(regular.promotions ?? [], []);
  // The Prime row: the same new item and seller at the members-only price, against its stated List Price.
  assert.equal(member.purchaseType, 'member');
  assert.equal(member.amountMinor, 19710);
  assert.equal(member.condition, 'new');
  assert.equal(member.seller, 'Pmnianhua furniture');
  assert.equal(member.compareAtAmountMinor, 21900);
  assert.equal(member.compareAtLabel, 'List Price');
  assert.equal(member.savingsPercent, 10);
  // The row states no stock; it is the same seller's item as the regular row.
  assert.equal(member.availability, regular.availability);
  assert.deepEqual(
    member.promotions?.map((p) => [p.type, p.text, p.effectiveMinor, p.percentOff, p.validUntil]),
    [['member', 'Exclusive Prime price', 19710, 10, undefined]],
  );
});

test('a member price is never the primary, even listed first', () => {
  const offer = (amountMinor: number, purchaseType?: 'member') => ({
    amountMinor,
    currency: 'CAD',
    currencyEvidence: 'x',
    url: 'https://www.amazon.ca/dp/B0BWDNXK3Q',
    condition: 'new' as const,
    ...(purchaseType ? { purchaseType } : {}),
    evidence: 'x',
  });
  const result = canonicalProducts({
    parserVersion: 'x',
    strategy: 'x',
    status: 'parsed',
    issues: [],
    products: [
      {
        url: 'https://www.amazon.ca/dp/B0BWDNXK3Q',
        title: 'Desk',
        images: [],
        evidence: 'x',
        offers: [offer(19710, 'member'), offer(21900)],
      },
    ],
  });
  assert.deepEqual(
    result.products[0].offers.map((o) => [o.amountMinor, o.purchaseType]),
    [
      [21900, undefined],
      [19710, 'member'],
    ],
  );
});
