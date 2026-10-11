import type { ShopifyStore } from '@morydeals/capture-contracts';
/** The storefront plus the exact product URL and variant a parse selected. */
export interface ShopifyTarget extends ShopifyStore {
  url: string;
  variantId: string;
}
