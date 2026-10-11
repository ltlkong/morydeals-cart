import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quotedCurrency, storefrontCurrency } from '../../../../src/parsing/parsers/currency.ts';
import { displayedMinorUnits } from '../../../../src/parsing/parsers/money.ts';
import { convertHtml } from '../../../../src/parsing/document/html-to-markdown.ts';

test('dollar prefixes name their currency (SHEIN shows CA$)', () => {
  assert.equal(quotedCurrency('FromCA$3.29\\-30%'), 'CAD');
  assert.equal(quotedCurrency('C$12.00'), 'CAD');
  assert.equal(quotedCurrency('US$5.00'), 'USD');
  assert.equal(quotedCurrency('$5.00'), undefined);
  // Conflicting markers stay ambiguous.
  assert.equal(quotedCurrency('CA$5.00 or US$4.00'), null);
});

test('a leading /ca/ market segment is a Canadian storefront', () => {
  assert.equal(storefrontCurrency('https://m.shein.com/ca/strip-p-1.html')?.currency, 'CAD');
  assert.equal(storefrontCurrency('https://m.shein.com/us/strip-p-1.html'), undefined);
  assert.equal(storefrontCurrency('https://shop.example/products/ca-mug'), undefined);
});

test('markdown emphasis inside a price is not part of the amount (Newegg $**209**.98)', () => {
  assert.equal(displayedMinorUnits('$**209**.98', 'CAD'), 20998);
  assert.equal(displayedMinorUnits('CA$3.29', 'CAD'), 329);
});

test('store strikethrough price elements become former-price markdown', () => {
  const { document } = convertHtml(
    `<main><h1>Strip</h1>
      <p><span class="bsc-price">CA$3.29</span> <span class="bsc-strikethrough-price__value">CA$4.70</span></p>
      <ul><li class="price-current">$209.98</li><li class="price-was">$244.98</li></ul></main>`,
    'https://m.shein.com/ca/strip-p-1.html',
    '2026-10-10T00:00:00Z',
  );
  assert.match(document.markdown, /~~CA\$4\.70~~/);
  assert.match(document.markdown, /~~\$244\.98~~/);
  assert.doesNotMatch(document.markdown, /~~CA\$3\.29~~|~~\$209\.98~~/);
});

test('a former price nested in several strikethrough elements is struck once (SHEIN)', () => {
  const { document } = convertHtml(
    `<main><h1>Sweatshirt</h1><div class="bsc-price">
      <span>FromCA$13.86</span><span class="bsc-discount-tag__value">-25%</span>
      <div class="bsc-strikethrough-price"><span class="bsc-strikethrough-price__value">CA$18.48</span></div>
    </div></main>`,
    'https://m.shein.com/ca/sweatshirt-p-1.html',
    '2026-10-10T00:00:00Z',
  );
  assert.match(document.markdown, /(?<!~)~~CA\$18\.48~~(?!~)/);
});

test('a former price drawn with a line-through utility class is struck (SSENSE)', () => {
  const { document } = convertHtml(
    `<main><h1>Black Sneakers</h1><div class="flex sale">
      <span data-test="regularPriceText" class="inline-block font-inter">$627 CAD</span>
      <div data-test="salePriceText"><span class="inline-block text-ssense-grey-2 line-through">$895 CAD</span>
      <span data-test="discount">30% OFF</span></div>
      <p class="decoration-line-through-hover">Free shipping on orders over $200 CAD</p>
    </div></main>`,
    'https://www.ssense.com/en-ca/men/product/x/black-sneakers/1',
    '2026-10-10T00:00:00Z',
  );
  assert.match(document.markdown, /~~\$895 CAD~~/);
  assert.doesNotMatch(document.markdown, /~~\$627 CAD~~/);
  assert.doesNotMatch(document.markdown, /~~Free shipping/);
});
