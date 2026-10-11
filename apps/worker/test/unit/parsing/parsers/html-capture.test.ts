import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlCaptureStrategy } from '../../../../src/parsing/parsers/html-capture.ts';

test('an uploaded page uses its store parser, then Shopify, then the generic path', () => {
  assert.equal(
    htmlCaptureStrategy('https://www.amazon.ca/dp/B00MW8G3YU', '<html></html>'),
    'amazon-ca',
  );
  assert.equal(
    htmlCaptureStrategy(
      'https://ca.shop.example/products/a',
      '<script>Shopify.shop = "a.myshopify.com";</script>',
    ),
    'shopify',
  );
  assert.equal(htmlCaptureStrategy('https://www.amazon.ca/', '<html></html>'), 'generic');
});
