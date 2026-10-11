import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canonicalProducts,
  parseAmazonProduct,
  type PageDocument,
} from '../../../../src/parsing/parsers/index.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../../fixtures/retailers/${name}.html`, import.meta.url), 'utf8');
const parse = (name: string, url: string, fetchedAt: string, html = fixture(name)) => {
  const document: PageDocument = {
    version: '1',
    url,
    requestedUrl: url,
    fetchedAt,
    markdown: '',
    jsonLd: [],
    metadata: {},
    html,
  };
  const result = canonicalProducts(parseAmazonProduct(document));
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  return result.products[0].offers;
};
const monTek = () =>
  parse(
    'amazon-mobile-used-B0DT494JX5',
    'https://www.amazon.ca/dp/B0DT494JX5/ref=syn_sd_onsite_mobileweb_0?ie=UTF8&psc=1',
    '2026-10-10T23:03:35.648Z',
  );
const shark = (html?: string) =>
  parse(
    'amazon-mobile-deal-B0FB5HZYG8',
    'https://www.amazon.ca/dp/B0FB5HZYG8/ref=sspa_mw_detail_0?ie=UTF8&psc=1',
    '2026-10-10T22:42:29.239Z',
    html,
  );

test('real mobile captures: the used row names its seller in its "Ships from / Sold by" header', () => {
  // monTEK: new from Densch; used from Warehouse Deals ("Ships from: Amazon Sold by: Warehouse Deals").
  assert.deepEqual(
    monTek().map((o) => [o.condition, o.amountMinor, o.seller]),
    [
      ['new', 8299, 'Densch'],
      ['used', 7185, 'Warehouse Deals'],
    ],
  );
  assert.deepEqual(
    shark().map((o) => [o.condition, o.amountMinor, o.seller]),
    [
      ['new', 39999, 'Amazon.ca'],
      ['used', 36799, 'Warehouse Deals'],
    ],
  );
});

test('a row that names no seller keeps none; the "Sold by X and Fulfilled by Amazon" line is read', () => {
  const html = fixture('amazon-mobile-deal-B0FB5HZYG8');
  // Without the abbreviated header, the used row's merchant line still names the seller.
  const header = html.replace(
    /<span class="a-size-small"> Sold by: <\/span>\s*<span class="a-size-small"> Warehouse Deals <\/span>/,
    '',
  );
  assert.notEqual(header, html);
  assert.equal(shark(header)[1].seller, 'Warehouse Deals');
  // With neither, the used offer has no seller rather than borrowing the new one's.
  const none = header.replace(
    /<div id="merchant-info"[\s\S]*?<\/div>/,
    '<div id="merchant-info"></div>',
  );
  assert.equal(shark(none)[1].seller, undefined);
});

test("a real mobile deal badge that shows only its countdown is kept, ending at the timer's own target time", () => {
  // Shark, captured 22:42:29Z: "Ends in 08:17:30", the timer stamped data-target-time="2026-10-11T06:59:59Z".
  const [deal] = shark()[0].promotions ?? [];
  assert.equal(deal?.type, 'deal');
  assert.equal(deal?.text, 'Deal');
  assert.equal(deal?.validUntil, '2026-10-11T06:59:59.000Z');
  assert.equal(deal?.validUntilEstimated, undefined);
  // The badge is the new offer's, never the used one's.
  assert.equal(shark()[1].promotions, undefined);
  // Without the stamp, the visible countdown gives an estimated end from the capture time.
  const unstamped = shark(
    fixture('amazon-mobile-deal-B0FB5HZYG8').replace(
      ' data-target-time="2026-10-11T06:59:59Z"',
      '',
    ),
  );
  assert.equal(unstamped[0].promotions?.[0].validUntil, '2026-10-11T06:59:59.239Z');
  assert.equal(unstamped[0].promotions?.[0].validUntilEstimated, true);
});

test('Subscribe & Save is its own new offer: a subscription price, never the primary', () => {
  // morydeals-affiliate's production-shaped Subscribe & Save buy box (desktop accordion).
  const offers = parse(
    'amazon-sns-B0BGJT87N2',
    'https://www.amazon.ca/dp/B0BGJT87N2',
    '2026-10-10T20:00:00Z',
  );
  assert.deepEqual(
    offers.map((o) => [o.condition, o.purchaseType, o.amountMinor]),
    [
      ['new', undefined, 5082],
      ['new', 'subscription', 4828],
    ],
  );
  // The shown first-delivery price, not the hidden repeat-delivery tier ($43.20), with its own message.
  assert.deepEqual(
    offers[1].promotions?.map((p) => [p.type, p.text]),
    [['other', 'Save 5% now and up to 15% on repeat deliveries.']],
  );
  // The subscription never becomes the primary; with no seller of its own it takes the featured offer's.
  const html = fixture('amazon-sns-B0BGJT87N2');
  const first = html
    .replace(
      '<div data-a-accordion-row-name="newAccordionRow">',
      '<div id="x-new" data-a-accordion-row-name="newAccordionRow">',
    )
    .replace(
      '<div id="availability">In Stock</div></div>',
      '<div id="sellerProfileTriggerId">Amazon.ca</div><div id="availability">In Stock</div></div>',
    );
  const sold = parse(
    'amazon-sns-B0BGJT87N2',
    'https://www.amazon.ca/dp/B0BGJT87N2',
    '2026-10-10T20:00:00Z',
    first,
  );
  assert.equal(sold[0].purchaseType, undefined);
  assert.equal(sold[1].seller, 'Amazon.ca');
});
