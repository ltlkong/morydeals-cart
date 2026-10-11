import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAmazonProduct,
  parseBestBuyProduct,
  parseNeweggProduct,
  parseWalmartProduct,
  type PageDocument,
} from '../../../../src/parsing/parsers/index.ts';

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
const price = (value: string, cls: string) =>
  `<span class="a-price ${cls}"><span class="a-offscreen">${value}</span><span aria-hidden="true">${value}</span></span>`;
// Minimal shape of an amazon.ca mobile page with a single featured offer.
const amazonMobile = (core: string) => `<html><head>
<link rel="canonical" href="https://www.amazon.ca/Nex-Playground/dp/B0D2JGYX3F"></head><body>
<span id="title">Nex Playground</span>
<div id="corePriceDisplay_mobile_feature_div">${core}</div>
<div id="mobile_buybox_feature_div"><div id="buybox"><div id="qualifiedBuybox">
<div id="twisterPlusPriceSubtotalWW_feature_div">${price('$319.00', '')}</div>
<input name="items[0.base][asin]" value="B0D2JGYX3F">
</div></div></div></body></html>`;
const listPrice = `<span aria-hidden="true" class="basisPrice">${price('$399.00', 'a-text-price apex-basisprice-value')}</span>`;

test('Amazon mobile single-offer pages read the main price display and its visible list price', () => {
  const result = parseAmazonProduct(
    document(
      'https://www.amazon.ca/dp/B0D2JGYX3F',
      amazonMobile(price('$319.00', 'apex-pricetopay-value') + listPrice),
    ),
  );
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  assert.equal(result.products[0].offers[0].amountMinor, 31900);
  assert.equal(result.products[0].offers[0].compareAtAmountMinor, 39900);
});

test('Amazon mobile pages never use the buy-box quantity subtotal as the price', () => {
  const result = parseAmazonProduct(
    document('https://www.amazon.ca/dp/B0D2JGYX3F', amazonMobile('')),
  );
  assert.equal(result.status, 'needs_review');
});

const swatches = (checked: string) =>
  ['B0CCZ26B5V', 'B0CCZ1SQ8G']
    .map(
      (asin) =>
        `<li data-defaultasin="${asin}"><span aria-checked="${asin === checked}"></span></li>`,
    )
    .join('');
// Loaded as the blue variant, then switched to green in-page.
const switchedVariant = (checked: string) =>
  amazonMobile(price('$249.00', 'apex-pricetopay-value'))
    .replace('Nex-Playground/dp/B0D2JGYX3F', 'QuietComfort/dp/B0CCZ26B5V')
    .replace('value="B0D2JGYX3F"', 'value="B0CCZ1SQ8G"')
    .replace('</body>', `<ul>${swatches(checked)}</ul></body>`);

test('Amazon mobile accepts an in-page variant switch only for the checked sibling variant', () => {
  const url = 'https://www.amazon.ca/dp/B0CCZ1SQ8G';
  const switched = parseAmazonProduct(document(url, switchedVariant('B0CCZ1SQ8G')));
  assert.equal(switched.status, 'parsed', switched.issues.join('; '));
  assert.equal(switched.products[0].sku, 'B0CCZ1SQ8G');
  assert.equal(switched.products[0].offers[0].amountMinor, 24900);
  const unchecked = parseAmazonProduct(document(url, switchedVariant('B0CCZ26B5V')));
  assert.deepEqual(unchecked.issues, ['Amazon selected ASIN mismatch']);
});

test('Amazon mobile follows an in-page variant switch that left the URL on the first variant', () => {
  // URL and canonical still name blue; the buy box sells green and green is the checked swatch.
  const url = 'https://www.amazon.ca/dp/B0CCZ26B5V';
  const switched = parseAmazonProduct(document(url, switchedVariant('B0CCZ1SQ8G')));
  assert.equal(switched.status, 'parsed', switched.issues.join('; '));
  assert.equal(switched.products[0].sku, 'B0CCZ1SQ8G');
  assert.equal(switched.products[0].url, 'https://www.amazon.ca/dp/B0CCZ1SQ8G');
  // The buy box alone is not enough: the checked swatch must agree.
  const unconfirmed = parseAmazonProduct(document(url, switchedVariant('B0CCZ26B5V')));
  assert.equal(unconfirmed.status, 'needs_review');
});

const walmartUrl =
  'https://www.walmart.ca/en/ip/your-fresh-market-pecan-pie-750-g/6000202061474?athAsset=x';
// After in-app navigation from the home page, __NEXT_DATA__ still describes "/".
const walmartAfterNavigation = (sku: string) => `<html><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ page: '/', props: { pageProps: { initialData: { data: {} } } } })}</script>
<script type="application/ld+json" data-seo-id="schema-org-product">${JSON.stringify({
  '@type': 'Product',
  name: 'Your Fresh Market Pecan Pie, 750 g',
  sku,
  image: 'https://i5.walmartimages.ca/images/Enlarge/578/506/6000202578506.jpg',
  brand: { '@type': 'Brand', name: 'Your Fresh Market' },
  offers: [
    {
      '@type': 'Offer',
      url: `https://www.walmart.ca/en/ip/your-fresh-market-pecan-pie-750-g/${sku}`,
      priceCurrency: 'CAD',
      price: 5.94,
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  ],
})}</script></body></html>`;

test('Walmart falls back to the rendered product after in-app navigation', () => {
  const result = parseWalmartProduct(document(walmartUrl, walmartAfterNavigation('6000202061474')));
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  const [product] = result.products;
  assert.equal(
    product.url,
    'https://www.walmart.ca/en/ip/your-fresh-market-pecan-pie-750-g/6000202061474',
  );
  assert.equal(product.offers[0].amountMinor, 594);
  // Schema.org allows a single image string.
  assert.deepEqual(product.images, [
    'https://i5.walmartimages.ca/images/Enlarge/578/506/6000202578506.jpg',
  ]);
  assert.equal(product.offers[0].availability, 'InStock');
  assert.equal(product.brand, 'Your Fresh Market');
});

test('Walmart rendered fallback still refuses a different item', () => {
  const result = parseWalmartProduct(document(walmartUrl, walmartAfterNavigation('6000000000000')));
  assert.equal(result.status, 'needs_review');
  assert.deepEqual(result.issues, ['Walmart selected item mismatch']);
});

const dawnUrl =
  'https://www.walmart.ca/en/ip/Dawn-Ultra-Dish-Soap-Original-2-64-L/5ELPL15W3VC6?athAsset=x';
// A product with sizes renders a ProductGroup (inside an array); each size is a variant with its own offer.
const walmartVariants = `<html><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ page: '/', props: { pageProps: { initialData: { data: {} } } } })}</script>
<script type="application/ld+json" data-seo-id="schema-org-product">${JSON.stringify([
  {
    '@type': 'ProductGroup',
    name: 'Dawn Ultra Dish Soap, Liquid Refill Jug, Original, 2.64 L',
    productGroupID: '1KN5CM37CMNK',
    brand: { '@type': 'Brand', name: 'Dawn' },
    hasVariant: [
      {
        '@type': 'Product',
        name: 'Dawn Ultra Dish Soap, Liquid Refill Jug, Original, 2.64 L',
        sku: '5ELPL15W3VC6',
        image: 'https://i5.walmartimages.ca/images/Large/dawn.jpg',
        offers: {
          '@type': 'Offer',
          url: 'https://www.walmart.ca/en/ip/Dawn-Ultra-Dish-Soap-Original-2-64-L/5ELPL15W3VC6',
          priceCurrency: 'CAD',
          price: 11.97,
          availability: 'https://schema.org/InStock',
        },
      },
      { '@type': 'Product', name: 'Dawn Ultra 4 L', sku: 'OTHER4LITRE' },
    ],
  },
])}</script></body></html>`;

test('Walmart reads the selected size of a product with variants', () => {
  const result = parseWalmartProduct(document(dawnUrl, walmartVariants));
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  const [product] = result.products;
  assert.equal(product.sku, '5ELPL15W3VC6');
  assert.equal(product.title, 'Dawn Ultra Dish Soap, Liquid Refill Jug, Original, 2.64 L');
  assert.equal(product.brand, 'Dawn');
  assert.equal(product.offers[0].amountMinor, 1197);
  assert.deepEqual(product.images, ['https://i5.walmartimages.ca/images/Large/dawn.jpg']);
});

test('a Walmart page whose product has not rendered yet is read again, not reviewed', () => {
  const result = parseWalmartProduct(
    document(
      'https://www.walmart.ca/en/ip/Wet-n-Wild-Blush/0UVLZYY3YD3J',
      `<html><head><title></title></head><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ page: '/', props: { pageProps: { initialData: { data: {} } } } })}</script>
</body></html>`,
    ),
  );
  assert.equal(result.incomplete, true);
});

// Reduced mobile DOM shape: repeated NEW labels are one offer, not two variants.
const amazonMobileOffers = `<link rel="canonical" href="https://www.amazon.ca/dp/B00MW8G3YU">
<h1 id="title">Amazon Basics Pads</h1><img id="main-image" src="https://m.media-amazon.com/images/example.jpg">
<div id="mobile_buybox_feature_div"><div id="buybox">
<div data-a-accordion-row-name="newAccordionRow">
<div data-csa-c-buying-option-type="NEW"></div><div data-csa-c-buying-option-type="NEW"></div>
<input name="items[0.base][asin]" value="B00MW8G3YU">
<input name="items[0.base][customerVisiblePrice][currencyCode]" value="CAD">
<span class="apex-pricetopay-value"><span class="a-offscreen">$17.09</span></span>
<span class="apex-basisprice-value"><span class="a-offscreen">$18.99</span></span>
</div><div data-a-accordion-row-name="subscribe"><div data-csa-c-buying-option-type="SNS"></div>
<span class="apex-pricetopay-value">$16.24</span></div></div></div>`;
const parseOffers = (value: string) =>
  parseAmazonProduct(document('https://www.amazon.ca/dp/B00MW8G3YU', value));

test('Amazon mobile selects the confirmed one-time offer, excluding subscription price', () => {
  const result = parseOffers(amazonMobileOffers);
  assert.equal(result.status, 'parsed');
  assert.equal(result.products[0].offers[0].amountMinor, 1709);
  assert.equal(result.products[0].offers[0].compareAtAmountMinor, 1899);
  assert.equal(result.products[0].offers[0].currency, 'CAD');
});

test('a bundle product sells its one-time purchase as BUNDLE: still the new offer, never the subscription', () => {
  // Aveeno multipack: the one-time row's option type is BUNDLE, the Subscribe & Save row SNS.
  const result = parseOffers(amazonMobileOffers.replaceAll('"NEW"', '"BUNDLE"'));
  // The reduced Subscribe & Save row names no ASIN, so its price is not taken as this product's.
  assert.deepEqual(result.issues, [
    'Amazon SNS offer skipped: Amazon purchase option ASIN is unconfirmed',
  ]);
  assert.equal(result.products[0].offers.length, 1);
  assert.equal(result.products[0].offers[0].amountMinor, 1709);
  // A used option is collected as a used offer, never as the new price.
  const used = parseOffers(amazonMobileOffers.replaceAll('"NEW"', '"USED"'));
  assert.equal(used.status, 'parsed');
  assert.deepEqual(
    used.products[0].offers.map((o) => [o.condition, o.amountMinor]),
    [['used', 1709]],
  );
});

test('Amazon mobile rejects mismatched purchase ASIN and currency', () => {
  assert.equal(
    parseOffers(amazonMobileOffers.replace('value="B00MW8G3YU"', 'value="B000000000"')).status,
    'needs_review',
  );
  assert.equal(
    parseOffers(amazonMobileOffers.replace('value="CAD"', 'value="USD"')).status,
    'needs_review',
  );
});

// Fixtures are page JSON that tests deliberately corrupt.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fixture = any;

// Newegg's mobile site: no __neweggState__, and ItemDetail carries a Price object.
const neweggUrl =
  'https://www.newegg.ca/samsung-1tb-9100-pro-nvme-2-0/p/N82E16820147902?Item=N82E16820147902';
const neweggMobile = (change: (state: Fixture, ld: Fixture) => void = () => {}) => {
  const ld: Fixture = {
    '@type': 'Product',
    sku: 'N82E16820147902',
    offers: { '@type': 'Offer', price: '274.97', priceCurrency: 'CAD' },
  };
  const state: Fixture = {
    params: { Item: 'N82E16820147902' },
    ItemDetail: {
      NeweggItemNumber: 'N82E16820147902',
      ItemNumber: '20-147-902',
      SellerName: 'Newegg',
      Seller: null,
      IsInStock: true,
      Feature: { IsNew: true, IsRefurbished: false, IsOpenBoxed: false },
      Description: { Title: 'SAMSUNG SSD 9100 PRO 1TB' },
      ItemManufactory: { Manufactory: 'SAMSUNG' },
      ImageList: ['20-147-902-17.jpg'],
      Price: {
        OriginalPriceText: '$464.97',
        FinalPrice: 274.97,
        InstantRebateAmount: 190,
        CurrentPriceDetail: { PriceInteger: '274', PriceDecimal: '.97' },
        CurrencyCode: 'CAD',
      },
    },
    Property: {
      SelectedProperties: [{ Name: 1, Value: 10001 }],
      AvailableMap: [
        { NeweggItemNumber: 'N82E16820147902', Map: [{ Name: 1, Value: 10001 }] },
        { NeweggItemNumber: 'N82E16820147906', Map: [{ Name: 1, Value: 10000 }] },
      ],
      PropertyGroups: [
        {
          GroupDescription: 'Style',
          HasPriceAdditionInfo: false,
          SelectedProperty: { Value: 10001 },
          Properties: [
            { Value: 10000, Description: 'With Heatsink' },
            { Value: 10001, Description: 'Without Heatsink' },
          ],
        },
      ],
    },
  };
  change(state, ld);
  return `<script type="application/ld+json">${JSON.stringify(ld)}</script><script>window.__initialState__=${JSON.stringify(state)};</script>`;
};

test('Newegg mobile reads the selected item price, list price and stock', () => {
  const result = parseNeweggProduct(document(neweggUrl, neweggMobile()));
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  const [product] = result.products;
  assert.equal(product.sku, 'N82E16820147902');
  assert.equal(product.offers[0].amountMinor, 27497);
  assert.equal(product.offers[0].compareAtAmountMinor, 46497);
  assert.equal(product.offers[0].seller, 'Newegg Canada');
  assert.equal(product.offers[0].availability, 'InStock');
  assert.deepEqual(product.images, [
    'https://c1.neweggimages.com/productimage/nb640/20-147-902-17.jpg',
  ]);
});

test('Newegg mobile refuses unconfirmed identity, price or seller', () => {
  const refused = (change: (state: Fixture, ld: Fixture) => void) =>
    assert.equal(
      parseNeweggProduct(document(neweggUrl, neweggMobile(change))).status,
      'needs_review',
    );
  refused((s) => (s.ItemDetail.NeweggItemNumber = 'N82E16820147906'));
  refused((s) => (s.Property.SelectedProperties = [{ Name: 1, Value: 10000 }]));
  refused((_, ld) => (ld.offers.price = '264.97'));
  refused((_, ld) => (ld.sku = 'N82E16820147906'));
  refused((s) => (s.ItemDetail.Price.InstantRebateAmount = 100));
  refused((s) => (s.ItemDetail.Price.CurrencyCode = 'USD'));
  refused((s) => (s.ItemDetail.SellerName = 'Other Seller'));
  refused((s) => {
    const group = s.Property.PropertyGroups[0];
    group.GroupDescription = 'Protection Plan';
    group.Properties[1].Description = '2-Year Protection Plan';
  });
});

// Best Buy after in-app navigation from the homepage: the state still describes "/en-ca".
const bestbuyUrl = 'https://www.bestbuy.ca/en-ca/product/asus-vivobook-15/20099717?icmp=ra';
const bestbuyAfterNavigation = (change: (ld: Fixture) => void = () => {}, product: object = {}) => {
  const ld: Fixture = {
    '@type': 'Product',
    name: 'ASUS Vivobook 15 Laptop',
    sku: '20099717',
    image: 'https://multimedia.bbycastatic.ca/multimedia/products/100x100/200/20099/20099717.jpg',
    brand: { '@type': 'Brand', name: 'ASUS' },
    offers: {
      '@type': 'Offer',
      price: 849.99,
      priceCurrency: 'CAD',
      availability: 'http://schema.org/InStock',
    },
  };
  change(ld);
  const state = {
    product: { product },
    routing: { locationBeforeTransitions: { pathname: '/en-ca' } },
  };
  return `<link rel="canonical" href="https://www.bestbuy.ca/en-ca/product/asus-vivobook-15/20099717">
<script type="application/ld+json" id="product-json-ld" data-rh="true">${JSON.stringify(ld)}</script>
<span data-automation="SKU_ID">Web Code: 20099717</span>
<img src="https://multimedia.bbycastatic.ca/multimedia/products/500x500/200/20099/20099717.jpg">
<img src="https://multimedia.bbycastatic.ca/multimedia/products/1500x1500/200/20099/20099717.jpg">
<script>window.__INITIAL_STATE__ = ${JSON.stringify(state)};</script>`;
};

test('Best Buy falls back to the rendered product after in-app navigation', () => {
  const result = parseBestBuyProduct(document(bestbuyUrl, bestbuyAfterNavigation()));
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  const [product] = result.products;
  assert.equal(product.url, 'https://www.bestbuy.ca/en-ca/product/20099717');
  assert.equal(product.offers[0].amountMinor, 84999);
  // The structured data names a 100x100 thumbnail; the gallery holds the photo at 500x500, the size every Best Buy
  // photo has (larger renditions 404 for some SKUs).
  assert.deepEqual(product.images, [
    'https://multimedia.bbycastatic.ca/multimedia/products/500x500/200/20099/20099717.jpg',
  ]);
  assert.equal(product.offers[0].availability, 'InStock');
});

test('Best Buy rendered fallback still refuses another product', () => {
  const refused = (html: string) =>
    assert.equal(parseBestBuyProduct(document(bestbuyUrl, html)).status, 'needs_review');
  refused(bestbuyAfterNavigation((ld) => (ld.sku = '20099999')));
  refused(bestbuyAfterNavigation((ld) => (ld.offers.priceCurrency = 'USD')));
  refused(bestbuyAfterNavigation().replace('Web Code: 20099717', 'Web Code: 20099999'));
  // A state that does hold a product keeps its strict SKU check.
  refused(bestbuyAfterNavigation(undefined, { sku: '20099999', name: 'Other' }));
  // An open-box listing is collected as an open-box offer, not refused.
  const openBox = parseBestBuyProduct(
    document(
      bestbuyUrl,
      bestbuyAfterNavigation((ld) => (ld.name = 'ASUS Vivobook 15 Laptop - Open Box')),
    ),
  );
  assert.equal(openBox.status, 'parsed');
  assert.equal(openBox.products[0].offers[0].condition, 'open_box');
});

// The rendered page around the stale state: the product's gallery thumbnails and its own pricing block, beside a
// recommendation card with another SKU and its own saving.
const bestbuyRendered = (pricing: string) =>
  bestbuyAfterNavigation().replace(
    '<span data-automation="SKU_ID">',
    `<div data-automation="media-gallery">
<img src="https://multimedia.bbycastatic.ca/multimedia/products/100x100/200/20099/20099717.jpg">
<img src="https://multimedia.bbycastatic.ca/multimedia/products/100x100/200/20099/20099717_2.jpg">
<img src="https://multimedia.bbycastatic.ca/multimedia/products/100x100/200/20099/20099717_1.jpg">
</div>
<section data-automation="layout-product-offer-details">${pricing}</section>
<div data-automation="recommendations"><img src="https://multimedia.bbycastatic.ca/multimedia/products/150x150/199/19968/19968308.jpg">
<span data-automation="product-price"><span>$199.99</span></span><span data-automation="product-saving">SAVE $20</span></div>
<span data-automation="SKU_ID">`,
  );
const bestbuyPricing = (shown: string, saving?: string) =>
  `<span data-automation="product-price"><span class="screenReaderOnly">${shown}</span><div aria-hidden="true"><div>${shown}</div></div></span>${
    saving ? `<span data-automation="product-saving">${saving}</span>` : ''
  }`;

test('a Best Buy page after in-app navigation keeps its whole gallery at 500x500 and its saving', () => {
  const result = parseBestBuyProduct(
    document(bestbuyUrl, bestbuyRendered(bestbuyPricing('$849.99', 'SAVE $150'))),
  );
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  const [product] = result.products;
  assert.deepEqual(product.images, [
    'https://multimedia.bbycastatic.ca/multimedia/products/500x500/200/20099/20099717.jpg',
    'https://multimedia.bbycastatic.ca/multimedia/products/500x500/200/20099/20099717_1.jpg',
    'https://multimedia.bbycastatic.ca/multimedia/products/500x500/200/20099/20099717_2.jpg',
  ]);
  // Best Buy shows the saving, not the regular price: regular = current + saving, as its page data says.
  assert.equal(product.offers[0].amountMinor, 84999);
  assert.equal(product.offers[0].compareAtAmountMinor, 99999);
});

test('a Best Buy page whose gallery has not loaded takes the photo of the same SKU left in the page state', () => {
  const html = bestbuyAfterNavigation((ld) => (ld.image = []))
    .replace(/<img[^>]*>/g, '')
    .replace(
      '"routing":',
      `"search":{"products":[{"sku":"20099717","highResImage":"https://multimedia.bbycastatic.ca/multimedia/products/1500x1500/200/20099/20099717.jpg"},{"sku":"20099999","highResImage":"https://multimedia.bbycastatic.ca/multimedia/products/1500x1500/200/20099/20099999.jpg"}]},"routing":`,
    );
  const result = parseBestBuyProduct(document(bestbuyUrl, html));
  assert.equal(result.status, 'parsed', result.issues.join('; '));
  assert.deepEqual(result.products[0].images, [
    'https://multimedia.bbycastatic.ca/multimedia/products/500x500/200/20099/20099717.jpg',
  ]);
});

test('a Best Buy saving is read only beside the price it belongs to', () => {
  for (const html of [
    bestbuyRendered(bestbuyPricing('$849.99')),
    // The shown price is not the structured price: its saving cannot be applied.
    bestbuyRendered(bestbuyPricing('$799.99', 'SAVE $150')),
  ]) {
    const result = parseBestBuyProduct(document(bestbuyUrl, html));
    assert.equal(result.status, 'parsed', result.issues.join('; '));
    assert.equal(result.products[0].offers[0].compareAtAmountMinor, undefined);
  }
});

test('Amazon device pages confirm the purchase option through the buy-now form', () => {
  const html = amazonMobile(price('$319.00', 'apex-pricetopay-value')).replace(
    '<input name="items[0.base][asin]" value="B0D2JGYX3F">',
    '<form id="buyNow"><input type="hidden" name="pipelineType" value="Chewbacca"><input type="hidden" name="asin" value="B0D2JGYX3F"></form>',
  );
  const result = parseAmazonProduct(document('https://www.amazon.ca/dp/B0D2JGYX3F', html));
  assert.deepEqual(result.issues, []);
  assert.equal(result.products[0].offers[0].amountMinor, 31900);
});

test('an Amazon page uploaded before it rendered is reported as incomplete, not as another product', () => {
  const result = parseAmazonProduct(
    document(
      'https://www.amazon.ca/dp/B0DV7T1G6Z',
      '<html><body><div id="a-page"><!-- sp:end-feature:start-body --></div></body></html>',
    ),
  );
  assert.equal(result.status, 'needs_review');
  assert.deepEqual(result.issues, ['Amazon page had not finished loading']);
  // Reading it again later can work, so the LLM is not asked to guess from an empty frame.
  assert.equal(result.incomplete, true);
});

test('Amazon mobile pages keep the whole gallery at full size, main image first, without videos or loaders', () => {
  // Real shape: only the first slide is loaded; later slides hold loader images until scrolled to.
  const slide = (id: string, type: string, inner: string) =>
    `<li data-csa-c-component="horizontalMediaCarousel" data-csa-c-media-type="${type}" data-csa-c-content-id="${id}">${inner}</li>`;
  const loader =
    '<img src="https://m.media-amazon.com/images/G/15/amazonui/loading/loading-2x-gray._CB485943255_.gif" class="carousel-loader-img"><img src="https://m.media-amazon.com/images/G/15/x-locale/common/transparent-pixel._CB485935025_.gif" class="white-bg">';
  const gallery = `<div id="image-block"><ol>
${slide('61VCrTciypL', 'IMAGE', '<img id="main-image" src="https://m.media-amazon.com/images/I/61VCrTciypL._AC_UF894,1000_QL80_.jpg" data-a-hires="https://m.media-amazon.com/images/I/61VCrTciypL._AC_UF894,1000_QL80_.jpg">')}
${slide('0345f78d35364f7ab46777bd914b42ef', 'VIDEO', '<img src="https://m.media-amazon.com/images/I/91X61ByiY9L._SY350_PKmb-play-button-overlay_.jpg">')}
${slide('71K+JRMRK-L', 'IMAGE', loader)}
${slide('71pxuPXt56L', 'IMAGE', loader)}
</ol></div>
<div id="sims">${slide('other1234XL', 'IMAGE', '')}</div>`;
  const html = amazonMobile(price('$319.00', 'apex-pricetopay-value')).replace(
    '<span id="title">',
    `${gallery}<span id="title">`,
  );
  const result = parseAmazonProduct(document('https://www.amazon.ca/dp/B0D2JGYX3F', html));
  assert.deepEqual(result.products[0].images, [
    'https://m.media-amazon.com/images/I/61VCrTciypL._AC_UF894,1000_QL80_.jpg',
    'https://m.media-amazon.com/images/I/71K+JRMRK-L._AC_SL1500_.jpg',
    'https://m.media-amazon.com/images/I/71pxuPXt56L._AC_SL1500_.jpg',
  ]);
});

test('a Best Buy product URL still showing the previous page (in-app navigation) is reported as not loaded yet', () => {
  // The address is the product, the DOM still the homepage: canonical /en-ca, no product data.
  const html = `<html><head><title>Best Buy Canada | Best Buy Canada</title>
<link rel="canonical" href="https://www.bestbuy.ca/en-ca"></head><body>
<script>window.__INITIAL_STATE__ = ${JSON.stringify({ product: { product: {} }, routing: { locationBeforeTransitions: { pathname: '/en-ca' } } })};</script>
</body></html>`;
  const result = parseBestBuyProduct(
    document(
      'https://www.bestbuy.ca/en-ca/product/bobsweep-ultravision/18925740?icmp=x#reviews',
      html,
    ),
  );
  assert.equal(result.status, 'needs_review');
  assert.deepEqual(result.issues, ['Best Buy page had not finished loading']);
  assert.equal(result.incomplete, true);
});
