import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseNeweggProduct,
  parseWalmartProduct,
  parseTargetProduct,
  parseAmazonProduct,
} from '../../../../src/parsing/parsers/index.ts';
import { amazonDeal } from '../../../../src/parsing/parsers/retailers/amazon.ts';
import { targetLocation, targetPdpUrl } from '../../../../src/parsing/parsers/retailers/target.ts';
import { htmlDocument, shownText, one } from '../../../../src/parsing/parsers/shared/html.ts';
import { retailerForUrl } from '../../../../src/parsing/parsers/retailers/routing.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../../fixtures/retailers/fixes-2/${name}`, import.meta.url), 'utf8');
const page = (url: string, html: string) => ({
  version: '1' as const,
  url,
  requestedUrl: url,
  fetchedAt: '2026-10-11T01:44:00.000Z',
  markdown: '',
  metadata: {},
  jsonLd: [],
  html,
});

test('Walmart: Overall pick badge, clearance deal and the Was label (real Shark capture)', () => {
  const url = 'https://www.walmart.ca/en/ip/shark/6000204703956';
  const result = parseWalmartProduct(page(url, fixture('walmart-shark-6000204703956.html')));
  assert.equal(result.status, 'parsed');
  const [product] = result.products;
  assert.deepEqual(product.badges, ['Overall pick']);
  const [offer] = product.offers;
  assert.equal(offer.amountMinor, 4900);
  assert.equal(offer.compareAtAmountMinor, 24998);
  assert.equal(offer.compareAtLabel, 'Was');
  assert.deepEqual(
    offer.promotions?.map((deal) => [deal.type, deal.text]),
    [['sale', 'Clearance']],
  );
});

test('Walmart: conditionType and the SOCIAL_PROOF flag (real Enfamil capture)', () => {
  const url = 'https://www.walmart.ca/en/ip/enfamil/6000207433192';
  const result = parseWalmartProduct(page(url, fixture('walmart-enfamil-6000207433192.html')));
  assert.equal(result.status, 'parsed');
  const [product] = result.products;
  assert.equal(product.boughtRecently, '500+ bought in past month');
  assert.deepEqual(product.badges, ['Overall pick']);
  assert.equal(product.offers[0].condition, 'new');
  assert.equal(product.offers[0].compareAtLabel, undefined);
});

test('Newegg: the item price excludes the shipping charge FinalPrice adds (real ASUS capture)', () => {
  const url = 'https://www.newegg.ca/p/N82E16883221821';
  const result = parseNeweggProduct(page(url, fixture('newegg-asus-N82E16883221821.html')));
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  const [product] = result.products;
  const [offer] = product.offers;
  // UnitCost 3399.99 − rebate 200 = 3199.99; FinalPrice 3229.98 adds 29.99 shipping.
  assert.equal(offer.amountMinor, 319999);
  assert.equal(offer.compareAtAmountMinor, 339999);
  assert.equal(product.rating?.value, 4.4);
  assert.equal(product.rating?.count, 27);
  assert.deepEqual(product.categories, ['Computer Systems', 'Gaming Desktop PC', 'ASUS']);
  assert.equal(product.specifications?.length, 30);
  assert.ok(!product.specifications?.some((spec) => /ranking/i.test(spec.name)));
  assert.deepEqual(
    offer.promotions?.map((deal) => [deal.type, deal.text, deal.validUntil]),
    [['deal', 'FantasTech Deal', undefined]],
  );
});

test('Newegg: a final price matching neither the item price nor it plus shipping is refused', () => {
  const url = 'https://www.newegg.ca/p/N82E16883221821';
  const html = fixture('newegg-asus-N82E16883221821.html').replace(
    '"FinalPrice": 3229.98',
    '"FinalPrice": 3239.98',
  );
  assert.notEqual(html, fixture('newegg-asus-N82E16883221821.html'));
  assert.notEqual(parseNeweggProduct(page(url, html)).status, 'parsed');
});

test('Amazon desktop deal badge: the inline countdown script is not its text; exact end from data-target-time', () => {
  const root = htmlDocument(fixture('amazon-desktop-deal-badge-B0FB5HZYG8.html'));
  assert.doesNotMatch(shownText(one(root, '#dealBadgeSupportingText')), /function|var /);
  const deal = amazonDeal(root, '2026-10-11T01:44:00.000Z');
  assert.equal(deal?.type, 'deal');
  assert.equal(deal?.text, 'Deal');
  assert.equal(deal?.validUntil, '2026-10-11T06:59:59.000Z');
  assert.ok(!deal?.validUntilEstimated);
});

test('amazon.com: an item that does not ship to the visitor has no price, not an ambiguous one', () => {
  const url = 'https://www.amazon.com/dp/B0DCBB2YTR';
  const html = `<html><head><link rel="canonical" href="${url}"></head><body>
    <input type="hidden" id="currencyOfPreference" value="CAD"><input type="hidden" id="ASIN" name="ASIN" value="B0DCBB2YTR"><input type="hidden" id="asin" name="asin" value="B0DCBB2YTR">
    <span id="productTitle">Anker Laptop Power Bank</span>
    <div id="desktop_buybox"><div id="buybox"><div id="outOfStock">This item cannot be shipped to your
      selected delivery location. Please choose a different delivery location.
      <span class="a-price"><span class="a-offscreen">CAD 117.39</span></span></div></div></div>
    <div id="apex_desktop"><span class="a-price"><span class="a-offscreen">CAD128.34</span></span></div>
  </body></html>`;
  const result = parseAmazonProduct(page(url, html));
  assert.notEqual(result.status, 'parsed');
  assert.match(result.issues.join(' '), /does not ship this item/);
});

test('Target: API key and store from the page, the redsky URL, and the parsed price', () => {
  const url =
    'https://www.target.com/p/apple-macbook-neo-a18-pro-2026-laptop-256gb-citrus/-/A-85966253';
  assert.equal(retailerForUrl(url), 'target-com');
  const at = targetLocation(fixture('target-page-config-85966253.html'));
  assert.deepEqual(at, {
    key: '9f36aeafbe60771e321a7cc95a78140772ab3e96',
    store: '3991',
    zip: '52404',
    state: 'IA',
    latitude: '41.9831',
    longitude: '-91.6686',
  });
  const api = new URL(targetPdpUrl('85966253', at!, url));
  assert.equal(api.host, 'redsky.target.com');
  assert.equal(api.pathname, '/redsky_aggregations/v1/web/pdp_client_v1');
  assert.equal(api.searchParams.get('pricing_store_id'), '3991');
  assert.equal(api.searchParams.get('tcin'), '85966253');
  // The answer's shape as pdp_client_v1 returns it (unverified against a live answer: see NOTES).
  const response = {
    data: {
      product: {
        tcin: '85966253',
        price: {
          current_retail: 549.99,
          reg_retail: 599.99,
          formatted_current_price_type: 'sale',
          save_percent: 8.33,
        },
        item: {
          product_description: {
            title: 'Apple MacBook Neo A18 Pro (2026) Laptop 256GB &#8211; Citrus',
          },
          primary_brand: { name: 'Apple' },
          enrichment: {
            images: {
              primary_image_url: 'https://target.scene7.com/is/image/Target/GUEST_1',
              alternate_image_urls: ['https://target.scene7.com/is/image/Target/GUEST_2'],
            },
          },
        },
        ratings_and_reviews: { statistics: { rating: { average: 3.97, count: 359 } } },
      },
    },
  };
  const result = parseTargetProduct({
    ...page(url, ''),
    html: undefined,
    target: { tcin: '85966253', store: '3991', response },
  });
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  const [product] = result.products;
  assert.equal(product.title, 'Apple MacBook Neo A18 Pro (2026) Laptop 256GB – Citrus');
  assert.equal(product.images.length, 2);
  assert.equal(product.rating?.count, 359);
  const [offer] = product.offers;
  assert.deepEqual(
    [offer.amountMinor, offer.currency, offer.compareAtAmountMinor, offer.savingsPercent],
    [54999, 'USD', 59999, 8],
  );
  assert.match(offer.evidence, /store 3991/);
});
