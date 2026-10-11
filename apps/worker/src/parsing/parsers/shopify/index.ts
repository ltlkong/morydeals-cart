import type { PageDocument } from '../types.ts';
import { parseShopifyLiquid } from './liquid.ts';
import { parseShopifyStorefront } from './storefront.ts';

/** Both sources normalize one selected variant into the same product contract. */
export function parseShopifyProduct(document: PageDocument) {
  return document.storefront ? parseShopifyStorefront(document) : parseShopifyLiquid(document);
}
