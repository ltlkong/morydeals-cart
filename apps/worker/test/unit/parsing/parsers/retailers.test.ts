import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseAmazonProduct,
  parseBestBuyProduct,
  parseNeweggProduct,
  type PageDocument,
} from '../../../../src/parsing/parsers/index.ts';
import { assignedJson, htmlDocument } from '../../../../src/parsing/parsers/shared/html.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../../fixtures/retailers/${name}.html`, import.meta.url), 'utf8');
const document = (url: string, html: string): PageDocument => ({
  version: '1',
  url,
  requestedUrl: url,
  fetchedAt: '2026-10-09T00:00:00Z',
  markdown: '',
  jsonLd: [],
  metadata: {},
  html,
});
const bb = () =>
  document('https://www.bestbuy.ca/en-ca/product/19190432', fixture('bestbuy-iphone16e-19190432'));
const egg = () =>
  document('https://www.newegg.ca/p/N82E16820147860', fixture('newegg-options-20147860'));
// Store page state is arbitrary site JSON; tests corrupt fields deep inside it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PageState = any;
function changeState(doc: PageDocument, name: string, change: (state: PageState) => void) {
  const state = assignedJson(htmlDocument(doc.html!), name);
  change(state);
  // Preserve other state blocks, replacing only the named assignment.
  const root = htmlDocument(doc.html!);
  const site =
    name === '__initialState__' ? assignedJson(root, '__neweggState__', true) : undefined;
  doc.html = `<script>window.${name} = ${JSON.stringify(state)};</script>${site ? `<script>window.__neweggState__ = ${JSON.stringify(site)};</script>` : ''}`;
  return doc;
}
function refused(result: ReturnType<typeof parseAmazonProduct>, message?: RegExp) {
  assert.equal(result.status, 'needs_review');
  assert.deepEqual(result.products, []);
  if (message) assert.match(result.issues.join(' '), message);
}

test('Amazon single and table layouts retain only current selected offer and former price', () => {
  for (const [name, id, current, former] of [
    ['amazon-single-B0FF3549YB', 'B0FF3549YB', 1999, undefined],
    ['amazon-price-table-B0CTMRXCTG', 'B0CTMRXCTG', 18999, 24999],
  ] as const) {
    const result = parseAmazonProduct(document(`https://www.amazon.ca/dp/${id}`, fixture(name)));
    assert.equal(result.status, 'parsed');
    assert.equal(result.products.length, 1);
    assert.equal(result.products[0].sku, id);
    assert.equal(result.products[0].offers.length, 1);
    assert.equal(result.products[0].offers[0].amountMinor, current);
    assert.equal(result.products[0].offers[0].compareAtAmountMinor, former);
    assert.equal(result.products[0].offers[0].currency, 'CAD');
  }
});
test('Amazon interstitial, replacement, no quote, and missing out-of-stock price never become prices', () => {
  for (const [name, id] of [
    ['card-page', 'B07MJM4F44'],
    ['replaced', 'B0DFYH5JW1'],
    ['no-featured-offer', 'B00004SU18'],
    ['out-of-stock', 'B0GWPMZKNS'],
  ]) {
    refused(
      parseAmazonProduct(
        document(`https://www.amazon.ca/dp/${id}`, fixture(`amazon-${name}-${id}`)),
      ),
    );
  }
});
test('Amazon purchase-region identity and display currency must match', () => {
  const doc = document('https://www.amazon.ca/dp/B0FF3549YB', fixture('amazon-single-B0FF3549YB'));
  refused(
    parseAmazonProduct({
      ...doc,
      requestedUrl: 'https://www.amazon.ca/dp/B000000000',
    }),
    /ASIN/,
  );
  refused(
    parseAmazonProduct({
      ...doc,
      html: doc.html!.replaceAll('value="CAD"', 'value="USD"'),
    }),
    /currency/,
  );
  refused(
    parseAmazonProduct({
      ...doc,
      url: 'https://amazon.ca.evil.example/dp/B0FF3549YB',
    }),
    /merchant/,
  );
});
test('Amazon typed regions keep new and used apart and exclude membership and sibling prices', () => {
  const html = `<span id="productTitle">Selected item</span><input id="ASIN" value="B000000001">
  <div id="desktop_buybox"><div id="buybox">
    <div data-a-accordion-row-name="newRow"><span data-csa-c-buying-option-type="NEW"></span><input name="ASIN" value="B000000001"><span class="offer-price">$49.99</span></div>
    <div data-a-accordion-row-name="usedRow"><span data-csa-c-buying-option-type="USED"></span><input name="ASIN" value="B000000001"><span class="offer-price">$9.99</span></div>
    <div data-a-accordion-row-name="primeRow"><span data-csa-c-buying-option-type="PRIME_SAVINGS_UPSELL"></span><span class="offer-price">$1.00</span></div>
  </div></div><div id="recommendations"><span class="apex-pricetopay-value">$2.00</span></div>`;
  const doc = document('https://www.amazon.ca/dp/B000000001', html);
  assert.deepEqual(
    parseAmazonProduct(doc).products[0].offers.map((o) => [o.condition, o.amountMinor]),
    [
      ['new', 4999],
      ['used', 999],
    ],
  );
  refused(
    parseAmazonProduct({
      ...doc,
      html: html.replace('$49.99', '$4.99 / month'),
    }),
    /price/,
  );
  refused(
    parseAmazonProduct({
      ...doc,
      html: html.replace('name="ASIN" value="B000000001"', 'name="ASIN" value="B000000002"'),
    }),
    /ASIN/,
  );
});
test('Amazon rejects monthly and explicit foreign-currency labels even inside a price widget', () => {
  const original = fixture('amazon-single-B0FF3549YB');
  for (const price of ['USD 19.99', '$1.99 monthly', 'EUR 19.99']) {
    const doc = document(
      'https://www.amazon.ca/dp/B0FF3549YB',
      original.replaceAll('$19.99', price),
    );
    refused(parseAmazonProduct(doc), /price|CAD/);
  }
});
test('Best Buy fixture with many variant neighbours produces only current SKU', () => {
  const result = parseBestBuyProduct(bb());
  assert.equal(result.status, 'parsed');
  assert.equal(result.products.length, 1);
  const p = result.products[0];
  assert.equal(p.sku, '19190432');
  assert.equal(p.offers[0].amountMinor, 86999);
  assert.equal(p.offers[0].availability, 'OutOfStock');
  assert.ok(p.images.length > 1);
});
test('Best Buy stores a former price and refuses carrier, wrong SKU and seller conflicts', () => {
  const result = parseBestBuyProduct(
    changeState(bb(), '__INITIAL_STATE__', (s) => {
      s.product.product.salePrice = 699.99;
    }),
  );
  assert.equal(result.products[0].offers[0].amountMinor, 69999);
  assert.equal(result.products[0].offers[0].compareAtAmountMinor, 86999);
  for (const mutate of [
    (s: PageState) => {
      s.product.product.sku = '99999999';
    },
    (s: PageState) => {
      s.product.product.name = 'Phone Monthly Financing';
    },
    (s: PageState) => {
      s.product.product.seller = { id: 'foreign', name: 'Other' };
    },
    (s: PageState) => {
      s.product.availability.sku = '99999999';
    },
    (s: PageState) => {
      s.product.product.salePrice = 12.345;
    },
  ])
    refused(parseBestBuyProduct(changeState(bb(), '__INITIAL_STATE__', mutate)));
});
test('Best Buy collects open-box, refurbished, used and Marketplace SKUs with their stated condition', () => {
  const graded = (grade: string | null, extra: Record<string, unknown> = {}) =>
    parseBestBuyProduct(
      changeState(bb(), '__INITIAL_STATE__', (s) => {
        Object.assign(s.product.product, { grade, ...extra });
      }),
    ).products[0]?.offers[0]?.condition;
  assert.equal(graded('Brand New'), 'new');
  assert.equal(graded('Open Box'), 'open_box');
  assert.equal(graded('Refurbished (Excellent)'), 'renewed');
  assert.equal(graded('Used - Good'), 'used');
  // Any other stated grade is second-hand, never new.
  assert.equal(graded('Excellent'), 'used');
  // Ungraded is new, first-party or Marketplace alike.
  assert.equal(graded(null), 'new');
  assert.equal(
    graded(null, { isMarketplace: true, seller: { id: '5671', name: 'Kiani Distribution' } }),
    'new',
  );
  assert.equal(graded(null, { name: 'Refurbished Roku TV' }), 'renewed');
});
test('Newegg parent path with explicit marketplace Item selects only that seller listing', () => {
  const doc = document(
    'https://www.newegg.ca/p/N82E16820147860?Item=9SIC7XMM4F0269',
    fixture('newegg-options-marketplace-9SIC7XMM4F0269'),
  );
  const result = parseNeweggProduct(doc);
  assert.equal(result.status, 'parsed');
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].sku, '9SIC7XMM4F0269');
  assert.equal(
    result.products[0].url,
    'https://www.newegg.ca/p/9SIC7XMM4F0269?Item=9SIC7XMM4F0269',
  );
  assert.equal(result.products[0].offers[0].amountMinor, 29311);
  assert.equal(result.products[0].offers[0].seller, 'Global Electronic Treasure Store');
  refused(
    parseNeweggProduct({
      ...doc,
      requestedUrl: 'https://www.newegg.ca/p/N82E16820147860',
    }),
    /different item/,
  );
});
test('Newegg selected hardware ignores sibling amounts and refuses inconsistent price, hidden, subscription and selected add-ons', () => {
  assert.equal(parseNeweggProduct(egg()).products[0].offers[0].amountMinor, 43997);
  for (const mutate of [
    (s: PageState) => {
      s.ItemDetail.FinalPrice += 10;
    },
    (s: PageState) => {
      s.ItemDetail.PriceHideMark = '1';
    },
    (s: PageState) => {
      s.ItemDetail.Subscription = { SubscriptionOnly: true };
    },
    (s: PageState) => {
      s.PropertyCollection.PropertyGroups.push({
        GroupDescription: 'Protection Plan',
        HasPriceAdditionInfo: true,
        SelectedProperty: { Value: 1 },
        Properties: [{ Value: 1, Description: '2 year warranty' }],
      });
    },
  ])
    refused(parseNeweggProduct(changeState(egg(), '__initialState__', mutate)));
  // A refurbished or open-box listing is collected with its condition.
  for (const [flag, condition] of [
    ['IsRefurbished', 'renewed'],
    ['IsOpenBoxed', 'open_box'],
  ] as const) {
    const result = parseNeweggProduct(
      changeState(egg(), '__initialState__', (s) => {
        s.ItemDetail.Feature[flag] = true;
      }),
    );
    assert.equal(result.products[0].offers[0].condition, condition);
  }
});
test('retailer JavaScript is never evaluated and ambiguous state is rejected', () => {
  const doc = bb();
  refused(
    parseBestBuyProduct({
      ...doc,
      html: '<script>window.__INITIAL_STATE__ = (() => { throw new Error("executed") })();</script>',
    }),
  );
  refused(parseBestBuyProduct({ ...doc, html: doc.html! + doc.html! }), /ambiguous/);
});
