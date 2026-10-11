import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { convertHtml } from '../../../../src/parsing/document/html-to-markdown.ts';

test('filters noise but retains product tables, page text, images, and JSON-LD', async () => {
  const html = await readFile(new URL('../../../fixtures/product.html', import.meta.url), 'utf8');
  const { document, report } = convertHtml(
    html,
    'https://shop.example/item',
    '2026-10-09T00:00:00Z',
  );
  assert.ok(document.markdown.includes('40 hours'));
  assert.ok(document.markdown.includes('| Feature'));
  assert.ok(document.markdown.includes('MORY10'));
  assert.ok(document.markdown.includes('https://shop.example/buy'));
  for (const noise of [
    'Navigation noise',
    'Accept all cookies',
    'Footer noise',
    'Hidden noise',
    'Recommended unrelated',
    'alert(',
  ])
    assert.ok(!document.markdown.includes(noise));
  assert.equal(document.jsonLd.length, 1);
  assert.equal('coupons' in document, false);
  assert.ok(report.removed.length);
});

test('long pages automatically select a semantic product region, retaining JSON and full cleaned HTML', () => {
  const html = `<script type="application/json" data-selected-variant>{"id":123,"price":19995}</script>
    <main><section id="product"><h1>Headphones</h1><img src="/pink.webp"><p>Regular price <s>$249.95</s> Sale price $199.95</p><form action="/cart/add"><button type="submit">Buy</button></form><table><tr><td>Battery</td><td>40 hours</td></tr></table></section><section>${'Marketing content. '.repeat(3000)}</section></main>`;
  const result = convertHtml(html, 'https://shop.example/product', '2026-10-09T00:00:00Z');
  assert.equal(result.report.contentSelection.scope, 'product-region');
  assert.ok(result.document.markdown.length < 24000);
  assert.ok(result.document.markdown.includes('~~$249.95~~'));
  assert.ok(result.document.markdown.includes('40 hours'));
  assert.ok(result.cleanedHtml.includes('Marketing content'));
  assert.deepEqual(result.document.embeddedProducts?.[0].value, { id: 123, price: 19995 });
  const full = convertHtml(
    html,
    'https://shop.example/product',
    '2026-10-09T00:00:00Z',
    [],
    'full',
  );
  assert.ok(full.document.markdown.length > 24000);
});

test('ambiguous headings and pages without a product region are preserved rather than silently truncated', () => {
  const html = `<main><h1>A</h1><h1>B</h1>${'Long description. '.repeat(3000)}</main>`;
  const result = convertHtml(html, 'https://shop.example/product', '2026-10-09T00:00:00Z');
  assert.equal(result.report.contentSelection.scope, 'full');
  assert.ok(result.document.markdown.length > 24000);
});
