import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canonicalProducts,
  parseAmazonProduct,
  parseBestBuyProduct,
} from '../../../../src/parsing/parsers/index.ts';
import { promotion, withoutDelivery } from '../../../../src/parsing/parsers/shared/facts.ts';

// Real backend (desktop) fetches from the Mac, 2026-10-11 UTC: Amazon over HTTP, Best Buy through Camoufox.
const parse = (name: string, url: string) => {
  const html = readFileSync(
    new URL(`../../../fixtures/retailers/${name}.html`, import.meta.url),
    'utf8',
  );
  const parser = url.includes('amazon') ? parseAmazonProduct : parseBestBuyProduct;
  const result = canonicalProducts(
    parser({
      version: '1',
      url,
      requestedUrl: url,
      fetchedAt: '2026-10-11T01:30:00.000Z',
      markdown: '',
      jsonLd: [],
      metadata: {},
      html,
    }),
  );
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  return result.products[0];
};
const amazonImage = /^https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9+-]+\._AC_SL1500_\.jpg$/;

test('Amazon desktop B0BWDNXK3Q: whole gallery, rating count, badge, specs, regular and Prime member offers', () => {
  const product = parse('amazon-desktop-prime-B0BWDNXK3Q', 'https://www.amazon.ca/dp/B0BWDNXK3Q');
  // The image block's colorImages.initial: 8 hiRes images of the selected variant, main first, no duplicates.
  assert.equal(product.images.length, 8);
  assert.equal(
    product.images[0],
    'https://m.media-amazon.com/images/I/71K9+28GnTL._AC_SL1500_.jpg',
  );
  assert.ok(product.images.every((image) => amazonImage.test(image)));
  assert.equal(new Set(product.images).size, 8);
  // "(219)" with aria-label "219 Reviews".
  assert.deepEqual(
    [product.rating?.value, product.rating?.count, product.rating?.scale],
    [4.4, 219, 5],
  );
  assert.deepEqual(product.badges, ["Amazon's Choice"]);
  assert.equal(product.brand, 'Pmnianhua');
  assert.equal(product.variant?.label, '140cm · Walnut');
  assert.equal(product.categories?.length, 4);
  // The desktop "Product information" table too.
  const specs = new Map(product.specifications?.map((s) => [s.name, s.value]));
  assert.equal(specs.get('Material'), 'Engineered Wood');
  assert.equal(specs.get('Item Dimensions'), '139.7 x 23.6 x 16 centimetres');
  assert.equal(specs.has('Customer Reviews'), false);
  assert.deepEqual(
    product.offers.map((o) => [
      o.amountMinor,
      o.purchaseType ?? 'one_time',
      o.condition,
      o.seller,
      o.shipsFrom,
      o.availability,
    ]),
    [
      [21900, 'one_time', 'new', 'Pmnianhua furniture', 'Amazon', 'InStock'],
      [19710, 'member', 'new', 'Pmnianhua furniture', 'Amazon', 'InStock'],
    ],
  );
  const member = product.offers[1];
  assert.equal(member.compareAtAmountMinor, 21900);
  assert.equal(member.compareAtLabel, 'List Price');
  assert.equal(member.savingsPercent, 10);
  assert.deepEqual(
    member.promotions?.map((p) => [p.type, p.effectiveMinor, p.percentOff]),
    [['member', 19710, 10]],
  );
});

test('Amazon desktop B0BGJT87N2: gallery, count, bought, All-offers summary, Shipper / Seller, eco fee, its offer', () => {
  const product = parse('amazon-desktop-B0BGJT87N2', 'https://www.amazon.ca/dp/B0BGJT87N2');
  assert.equal(product.images.length, 7);
  assert.equal(
    product.images[0],
    'https://m.media-amazon.com/images/I/61YULkQowXL._AC_SL1500_.jpg',
  );
  assert.deepEqual([product.rating?.value, product.rating?.count], [4, 1422]);
  assert.equal(product.boughtRecently, '400+ bought in past month');
  // Its Amazon's Choice widget is empty here (the words on the page belong to sponsored items).
  assert.equal(product.badges, undefined);
  assert.equal(product.offerSummary?.text, 'New (2) from $79.28');
  assert.equal(product.offerSummary?.fromMinor, 7928);
  const specs = new Map(product.specifications?.map((s) => [s.name, s.value]));
  assert.equal(specs.get('Model Number'), 'RZ01-03600100-R3U1');
  // One buy-box offer: no Subscribe & Save, used or coupon row on this page.
  assert.equal(product.offers.length, 1);
  const [offer] = product.offers;
  assert.equal(offer.amountMinor, 11996);
  assert.equal(offer.seller, 'Amazon.ca');
  assert.equal(offer.shipsFrom, 'Amazon.ca'); // "Shipper / Seller Amazon.ca"
  assert.equal(offer.fee, '$0.55 eco fee might apply');
  assert.deepEqual(
    offer.promotions?.map((p) => [p.type, p.text]),
    [['other', '90 days free of Amazon Music with purchase']],
  );
});

test('Best Buy desktop 17158465: full state, Selling Fast, sale end; the special offer without its delivery sentence', () => {
  const product = parse(
    'bestbuy-desktop-17158465',
    'https://www.bestbuy.ca/en-ca/product/17158465',
  );
  assert.equal(product.images.length, 7);
  assert.ok(product.images.every((image) => image.includes('/500x500/')));
  assert.deepEqual([product.rating?.value, product.rating?.count], [4.56, 2094]);
  assert.deepEqual(product.badges, ['Selling Fast']);
  assert.equal(product.variant?.label, 'Stainless Steel');
  assert.equal(product.specifications?.[0]?.value, 'FDPC4314AS');
  assert.ok((product.specifications?.length ?? 0) > 30);
  const [offer] = product.offers;
  assert.deepEqual(
    [offer.amountMinor, offer.compareAtAmountMinor, offer.seller, offer.availability],
    [52599, 57999, 'Best Buy Canada', 'InStock'],
  );
  // The page states no "Was" label or percent (only SAVE $54), so neither is set.
  assert.equal(offer.compareAtLabel, undefined);
  assert.equal(offer.savingsPercent, undefined);
  assert.deepEqual(
    offer.promotions?.map((p) => [p.type, p.text, p.validUntil, p.amountOffMinor]),
    [
      // "Sale ends: October 15, 2026*": a deal by its end, without the $54 the struck price shows.
      ['sale', 'Sale', '2026-10-16T07:00:00.000Z', undefined],
      [
        'multi_buy',
        'Get up to $1,000 off in-cart when you buy 2 or more select major kitchen appliances of the same brand.*',
        undefined,
        100000,
      ],
    ],
  );
  assert.doesNotMatch(JSON.stringify(product.offers), /deliver|shipping|haul/i);
});

test('deal words lose their delivery or shipping sentences; the offer sentence stays', () => {
  assert.equal(
    withoutDelivery('Get $200 off select TVs.* Plus, enjoy free local delivery and haul away.'),
    'Get $200 off select TVs.*',
  );
  assert.equal(
    withoutDelivery('Save 10% on 2 items. Free shipping on orders over $35.'),
    'Save 10% on 2 items.',
  );
  assert.equal(withoutDelivery('Save 15% with coupon'), 'Save 15% with coupon');
  assert.equal(
    promotion('other', 'Get $50 off. Delivered free by Friday.', 'x')?.text,
    'Get $50 off.',
  );
  // All delivery: still not a deal.
  assert.equal(promotion('other', 'FREE delivery Monday, October 19', 'x'), undefined);
});
