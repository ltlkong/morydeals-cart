import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productReadiness, pageChallenge } from '../../../src/acquisition/product-readiness.ts';

test('template and navigation prices do not count as current product content', () => {
  assert.equal(
    productReadiness(
      '<title>General PDP Template</title><header>Save $99</header><main><div id="product"></div></main>',
    ).ready,
    false,
  );
  assert.equal(
    productReadiness('<header>$49</header><main><h1>Product</h1><div>Loading…</div></main>').ready,
    false,
  );
  assert.equal(productReadiness('<main><h1>Product</h1><p>CAD 49.99</p></main>').ready, true);
  assert.equal(productReadiness('<main><h1>Product</h1><p>Out of stock</p></main>').ready, true);
});
test('structured offer must be named and priced, recommendation lists do not qualify', () => {
  const html = (data: unknown) =>
    `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  const product = { '@type': 'Product', name: 'Cat tree', offers: { price: '59.99' } };
  assert.equal(productReadiness(html({ '@graph': [product] })).ready, true);
  assert.equal(productReadiness(html({ ...product, offers: {} })).ready, false);
  assert.equal(
    productReadiness(html({ '@type': 'ItemList', itemListElement: [product] })).ready,
    false,
  );
});
test('explicit verification pages are classified independently of merchants', () => {
  assert.ok(pageChallenge('https://store.example', 200, '<title>Just a moment...</title>'));
  assert.equal(
    pageChallenge('https://store.example', 200, '<h1>Robot vacuum</h1><p>$99</p>'),
    undefined,
  );
});

test('price loading placeholders and zero structured quotes are not ready', () => {
  const zero =
    '<script type="application/ld+json">{"@type":"Product","name":"Cat tree","offers":{"price":0}}</script>';
  assert.equal(
    productReadiness(zero + '<main><h1>Cat tree</h1><p>Earn $50 rewards</p></main>').ready,
    false,
  );
  assert.equal(
    productReadiness(
      '<main><h1>Cat tree</h1><span aria-busy="true" data-testid="priceSkeleton"></span><p>Save $65</p></main>',
    ).ready,
    false,
  );
});
