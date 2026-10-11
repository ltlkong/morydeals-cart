import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shopifyLanguage, ShopifyStoreSchema } from '@morydeals/capture-contracts';
import { detectShopify } from '../../../../src/parsing/parsers/index.ts';

test('Shopify locale conversion preserves supported distinctions without turning a country into language', () => {
  for (const [locale, expected] of [
    ['en-CA', 'EN'],
    ['fr_CA', 'FR'],
    ['pt-BR', 'PT_BR'],
    ['pt-PT', 'PT_PT'],
    ['zh-TW', 'ZH_TW'],
    ['zh-Hans', 'ZH_CN'],
    ['zh-Hant-TW', 'ZH_TW'],
    ['fil', 'FIL'],
    ['ckb', 'CKB'],
  ])
    assert.equal(shopifyLanguage(locale), expected);
  assert.equal(shopifyLanguage('xx-YY'), undefined);
  const detected = detectShopify(
    '<script>Shopify.locale="en-CA"; Shopify.country="CA"; Shopify.currency={"active":"CAD"};</script>',
  );
  assert.equal(detected.language, 'EN');
  assert.equal(detected.country, 'CA');
  assert.equal(detected.currency, 'CAD');
  const store = { shopDomain: 'example.myshopify.com', country: 'CA', currency: 'CAD' };
  assert.equal(ShopifyStoreSchema.safeParse({ ...store, language: 'EN_CA' }).success, false);
  assert.equal(ShopifyStoreSchema.safeParse({ ...store, language: 'FIL' }).success, true);
});
