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
const page = (url: string, html: string): PageDocument => ({
  version: '1',
  url,
  requestedUrl: url,
  fetchedAt: '2026-10-10T00:00:00Z',
  markdown: '',
  jsonLd: [],
  metadata: {},
  html,
});
const url = 'https://www.amazon.ca/dp/B0CHX1W1XY';

test('Amazon collects the new, used and All-offers prices, each with its condition and seller', () => {
  const result = parseAmazonProduct(page(url, fixture('amazon-conditions-synthetic-B0CHX1W1XY')));
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  const offers = result.products[0].offers.map((o) => ({
    condition: o.condition,
    amount: o.amountMinor,
    was: o.compareAtAmountMinor,
    seller: o.seller,
  }));
  assert.deepEqual(offers, [
    // The featured new offer stays first: it is the product's price.
    { condition: 'new', amount: 29900, was: 32900, seller: 'Amazon.ca' },
    { condition: 'used', amount: 23915, was: undefined, seller: 'Amazon Resale' },
    { condition: 'renewed', amount: 21999, was: undefined, seller: 'Tech Renewed Canada' },
    { condition: 'used', amount: 19850, was: undefined, seller: 'Second Life Audio' },
    { condition: 'new', amount: 30499, was: undefined, seller: 'Gadget Hub CA' },
  ]);
  // The subscription row is no item price, and the offer for another ASIN is skipped with a note.
  assert.ok(!offers.some((o) => o.amount === 28405 || o.amount === 9900));
  assert.ok(result.issues.some((issue) => /other offer 4 skipped/.test(issue)));
});

test('a page whose only featured offer is used is collected as used, never as a new price', () => {
  const html = fixture('amazon-conditions-synthetic-B0CHX1W1XY')
    .replace(
      /<div id="newAccordionRow_0"[\s\S]*?<\/div>\s*<\/div>\s*<div id="usedAccordionRow"/,
      '<div id="usedAccordionRow"',
    )
    .replace(/<div id="aod-container">[\s\S]*$/, '</body></html>');
  const result = parseAmazonProduct(page(url, html));
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  assert.deepEqual(
    result.products[0].offers.map((o) => [o.condition, o.amountMinor]),
    [['used', 23915]],
  );
});

test('a Renewed listing (its own ASIN) is a renewed offer', () => {
  const html = fixture('amazon-single-B0FF3549YB');
  const title = /<span id="productTitle"[^>]*>([^<]*)</.exec(html)?.[1] ?? '';
  const renewed = html.replace(title, `${title.trim()} (Renewed)`);
  const result = parseAmazonProduct(page('https://www.amazon.ca/dp/B0FF3549YB', renewed));
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  assert.equal(result.products[0].offers[0].condition, 'renewed');
});

test('real captured Amazon pages keep one featured new offer', () => {
  for (const [name, asin] of [
    ['amazon-single-B0FF3549YB', 'B0FF3549YB'],
    ['amazon-price-table-B0CTMRXCTG', 'B0CTMRXCTG'],
  ]) {
    const result = parseAmazonProduct(page(`https://www.amazon.ca/dp/${asin}`, fixture(name)));
    assert.equal(result.status, 'parsed');
    assert.deepEqual(
      result.products[0].offers.map((o) => o.condition),
      ['new'],
    );
  }
});

test('the stored first offer is new whenever the page has a new offer', () => {
  const offer = (condition: 'new' | 'used' | 'renewed' | undefined, amountMinor: number) => ({
    amountMinor,
    currency: 'CAD',
    currencyEvidence: 'e',
    ...(condition ? { condition } : {}),
    evidence: 'e',
  });
  const result = canonicalProducts({
    parserVersion: 'test',
    strategy: 'schema-org',
    status: 'parsed',
    issues: [],
    products: [
      {
        url: 'https://shop.example/p',
        title: 'P',
        images: [],
        evidence: 'e',
        offers: [offer('used', 500), offer('renewed', 600), offer(undefined, 900)],
      },
    ],
  });
  assert.deepEqual(
    result.products[0].offers.map((o) => [o.condition, o.amountMinor]),
    [
      [undefined, 900],
      ['used', 500],
      ['renewed', 600],
    ],
  );
});
