import { retailerForUrl } from './retailers/routing.ts';
import { detectShopify } from './shopify/detection.ts';

/** Parsing strategy for an uploaded WebView page: its store parser, then Shopify, then the generic path. */
export function htmlCaptureStrategy(url: string, html: string) {
  return (
    retailerForUrl(url) ??
    (detectShopify(html).evidence.includes('Shopify.shop') ? 'shopify' : 'generic')
  );
}
