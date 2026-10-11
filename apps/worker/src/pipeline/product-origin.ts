import type { ParseResult } from '../parsing/parsers/index.ts';

const site = (url: string) => new URL(url).hostname.replace(/^www\./, '');
/**
 * Page data may declare any product URL. Products are keyed by URL, so a page must
 * not be able to write another site's products or price history.
 */
export function confineToPage(result: ParseResult, pageUrls: string[]): ParseResult {
  const allowed = new Set(pageUrls.map(site));
  const products = result.products.filter((product) => {
    try {
      return allowed.has(site(product.url));
    } catch {
      return false;
    }
  });
  if (products.length === result.products.length) return result;
  return {
    ...result,
    status: 'needs_review',
    products,
    issues: [...result.issues, 'Product URL is outside the captured site'],
  };
}
