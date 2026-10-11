import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ParseResult } from '../../../src/parsing/parsers/index.ts';
import { confineToPage } from '../../../src/pipeline/product-origin.ts';

const result = (...urls: string[]): ParseResult => ({
  parserVersion: 'test',
  strategy: 'generic',
  status: 'parsed',
  issues: [],
  products: urls.map((url) => ({
    url,
    title: url,
    images: [],
    offers: [],
    evidence: 'test',
  })),
});

test('products on the captured site are kept unchanged', () => {
  const parsed = result('https://shop.example/p?variant=1');
  assert.equal(confineToPage(parsed, ['https://www.shop.example/p']), parsed);
});

test('products declared for another site are removed and need review', () => {
  const parsed = confineToPage(result('https://shop.example/p', 'https://www.amazon.ca/dp/X'), [
    'https://shop.example/p',
  ]);
  assert.equal(parsed.status, 'needs_review');
  assert.deepEqual(
    parsed.products.map((product) => product.url),
    ['https://shop.example/p'],
  );
  assert.match(parsed.issues.at(-1)!, /outside the captured site/);
});
