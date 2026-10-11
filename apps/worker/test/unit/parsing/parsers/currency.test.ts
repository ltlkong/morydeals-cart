import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storefrontCurrency, resolveCurrency } from '../../../../src/parsing/parsers/currency.ts';

test('Canadian market URL tokens are shared rules, not a merchant allowlist', () => {
  for (const url of [
    'https://another.ca/p',
    'https://ca.brand.example/p',
    'https://brand.example/en-ca/p',
    'https://brand.example/fr-ca/p',
  ]) {
    assert.equal(storefrontCurrency(url)?.currency, 'CAD');
    assert.equal(resolveCurrency('USD', 'explicit page price', url)?.currency, 'USD');
  }
  for (const url of [
    'https://canada.example/p',
    'https://brand.ca.example/p',
    'https://brand.example/products/ca',
    'https://brand.example/p?market=ca',
    'https://brand.example/p/en-ca',
    'invalid',
  ]) {
    assert.equal(storefrontCurrency(url), undefined, url);
  }
});
