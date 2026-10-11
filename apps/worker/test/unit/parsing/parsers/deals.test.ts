import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseAmazonProduct,
  parseBestBuyProduct,
  type PageDocument,
} from '../../../../src/parsing/parsers/index.ts';
import { jsonLdStrategy } from '../../../../src/parsing/parsers/parser.ts';
import { countdownEnd, countdownMs } from '../../../../src/parsing/parsers/shared/facts.ts';
import { assignedJson, htmlDocument } from '../../../../src/parsing/parsers/shared/html.ts';
import { dealEnd } from '../../../../src/database/capture.repository.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../../fixtures/retailers/${name}.html`, import.meta.url), 'utf8');
const capturedAt = '2026-10-10T20:00:00.000Z';
const page = (url: string, html: string, extra: Partial<PageDocument> = {}): PageDocument => ({
  version: '1',
  url,
  requestedUrl: url,
  fetchedAt: capturedAt,
  markdown: '',
  jsonLd: [],
  metadata: {},
  html,
  ...extra,
});
const razer = 'https://www.amazon.ca/dp/B0BGJT87N2';
const deal = (html: string, extra: Partial<PageDocument> = {}) => {
  const result = parseAmazonProduct(page(razer, html, extra));
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  return result.products[0].offers[0].promotions?.find((p) => p.type === 'deal');
};

test('relative countdowns become a time left; a days-only one is too coarse to keep', () => {
  assert.equal(countdownMs('Ends in 5h 12m'), (5 * 60 + 12) * 60_000);
  assert.equal(countdownMs('Limited-time deal 5 hours 12 minutes'), (5 * 60 + 12) * 60_000);
  assert.equal(countdownMs('Ends in 05:12:33'), ((5 * 60 + 12) * 60 + 33) * 1000);
  assert.equal(countdownMs('1 day 3 hrs'), 27 * 3_600_000);
  assert.equal(countdownMs('Ends in 2 days'), undefined);
  assert.equal(countdownMs('Limited-time deal NO_OF_HOURS hours NO_OF_MINUTES minutes'), undefined);
  assert.equal(countdownMs('Limited-time deal'), undefined);
  // The end is the capture time plus the time shown, not the time we parse it.
  assert.equal(countdownEnd('Ends in 5h 12m', capturedAt), '2026-10-11T01:12:00.000Z');
  assert.equal(countdownEnd('Ends in 5h 12m', undefined), undefined);
});

test('a real Amazon limited-time deal badge without a running countdown has no end', () => {
  // Live capture (reduced): the countdown labels are still the page's unfilled templates.
  const found = deal(fixture('amazon-deal-B0BGJT87N2'));
  assert.deepEqual(found && { ...found, evidence: undefined }, {
    type: 'deal',
    text: 'Limited-time deal',
    kind: 'limited_time',
    evidence: undefined,
  });
});

test('a filled Amazon countdown gives an estimated end from the capture time', () => {
  const html = fixture('amazon-deal-B0BGJT87N2').replace(
    'Limited-time deal NO_OF_HOURS hours NO_OF_MINUTES minutes',
    'Limited-time deal 5 hours 12 minutes',
  );
  const found = deal(html);
  assert.equal(found?.text, 'Limited-time deal');
  assert.equal(found?.validUntil, '2026-10-11T01:12:00.000Z');
  assert.equal(found?.validUntilEstimated, true);
  // A later capture of the same page counts from its own time.
  assert.equal(
    deal(html, { fetchedAt: '2026-10-10T21:00:00.000Z' })?.validUntil,
    '2026-10-11T02:12:00.000Z',
  );
});

test('a Lightning Deal with a visible timer and its claimed share', () => {
  const html = fixture('amazon-deal-B0BGJT87N2')
    .replace(
      '<span>Limited-time deal</span>',
      '<span>Lightning Deal</span> <span>Ends in 01:30:00</span>',
    )
    // The real page holds an empty deal-progress container; a running Lightning Deal fills it.
    .replace(
      '<div id="dealProgress_feature_div" class="celwidget" data-csa-c-asin="B0BGJT87N2">',
      '<div id="dealProgress_feature_div" class="celwidget" data-csa-c-asin="B0BGJT87N2"><span>57% claimed</span>',
    );
  const found = deal(html);
  assert.equal(found?.text, 'Lightning Deal');
  assert.equal(found?.kind, 'lightning');
  assert.equal(found?.claimedPercent, 57);
  assert.equal(found?.validUntil, '2026-10-10T21:30:00.000Z');
});

test("Amazon's delivery cut-off countdown is never read as a deal end", () => {
  // Real capture: "Order within 3 hrs 58 mins" for delivery, and no deal badge.
  const result = parseAmazonProduct(
    page('https://www.amazon.ca/dp/B0FF3549YB', fixture('amazon-single-B0FF3549YB')),
  );
  assert.equal(result.status, 'parsed');
  assert.equal(result.products[0].offers[0].promotions, undefined);
});

test('Best Buy saleEndDate is an exact end; a hidden end is not kept', () => {
  const url = 'https://www.bestbuy.ca/en-ca/product/19190432';
  const state = assignedJson(
    htmlDocument(fixture('bestbuy-iphone16e-19190432')),
    '__INITIAL_STATE__',
  ) as {
    product: { product: Record<string, unknown> };
  };
  const sale = (extra: Record<string, unknown>) => {
    Object.assign(state.product.product, { isOnSale: true, salePrice: 799.99, ...extra });
    const html = `<script>window.__INITIAL_STATE__ = ${JSON.stringify(state)};</script>`;
    return parseBestBuyProduct(page(url, html)).products[0].offers[0].promotions?.[0];
  };
  const exact = sale({ saleEndDate: Date.parse('2026-10-13T06:59:00Z') });
  assert.equal(exact?.validUntil, '2026-10-13T06:59:00.000Z');
  assert.equal(exact?.validUntilEstimated, undefined);
  assert.equal(sale({ hideSaleEndDate: true })?.validUntil, undefined);
});

test('JSON-LD: a sale price valid through an instant ends then; priceValidUntil alone is not a deal', () => {
  const url = 'https://shop.example/products/kettle';
  const offer = (extra: object) => ({
    '@type': 'Offer',
    priceCurrency: 'CAD',
    priceSpecification: [
      { '@type': 'UnitPriceSpecification', price: 59.99, priceCurrency: 'CAD', ...extra },
      {
        '@type': 'UnitPriceSpecification',
        priceType: 'https://schema.org/StrikethroughPrice',
        price: 79.99,
      },
    ],
    priceValidUntil: '2027-12-31',
  });
  const promotions = (extra: object) =>
    jsonLdStrategy.parse(
      page(url, '', {
        jsonLd: [{ '@type': 'Product', name: 'Kettle', url, offers: offer(extra) }],
      }),
    ).products[0].offers[0].promotions;
  assert.deepEqual(
    promotions({ validThrough: '2026-10-12T23:59:00-07:00' })?.map((p) => [p.type, p.validUntil]),
    [['sale', '2026-10-13T06:59:00.000Z']],
  );
  assert.equal(promotions({}), undefined);
  // A bare date has no zone to count down to.
  assert.equal(promotions({ validThrough: '2026-10-12' }), undefined);
});

test('the stored deal end is the soonest one, and says whether it was estimated', () => {
  const base = { amountMinor: 1, currency: 'CAD', currencyEvidence: 'e', evidence: 'e' };
  assert.deepEqual(dealEnd(base), {});
  assert.deepEqual(
    dealEnd({
      ...base,
      promotions: [
        { type: 'sale', text: 'Sale', validUntil: '2026-10-13T06:59:00.000Z', evidence: 'e' },
        {
          type: 'deal',
          text: 'Lightning Deal',
          validUntil: '2026-10-10T21:30:00.000Z',
          validUntilEstimated: true,
          evidence: 'e',
        },
        { type: 'coupon', text: 'Save 5%', evidence: 'e' },
      ],
    }),
    { dealEndsAt: new Date('2026-10-10T21:30:00.000Z'), dealEndsEstimated: true },
  );
});
