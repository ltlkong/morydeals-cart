import { amazonStore } from './amazon-page.ts';
import { ctcProductCode } from './ctc.ts';
import { homeDepotProductId } from './homedepot.ts';
import { targetTcin } from './target.ts';

export type Retailer =
  | 'amazon-ca'
  | 'amazon'
  | 'bestbuy-ca'
  | 'newegg-ca'
  | 'walmart-ca'
  | 'ctc-ca'
  | 'homedepot-ca'
  | 'target-com';
/** Exact hosts and supported product paths; a tracking query cannot impersonate a merchant. */
export function retailerForUrl(value: string): Retailer | undefined {
  const url = new URL(value);
  if (url.port || url.username || url.password) return;
  const host = url.hostname.replace(/^www\./, '');
  // amazon.ca keeps its own strategy name; other Amazon storefronts (amazon.com, …) share the parser.
  if (
    amazonStore(value) &&
    /\/(?:dp|gp\/product|gp\/aw\/d)\/[A-Z0-9]{10}(?:\/|$)/i.test(url.pathname)
  )
    return host === 'amazon.ca' ? 'amazon-ca' : 'amazon';
  if (host === 'bestbuy.ca' && /^\/en-ca\/product\/(?:[^/]+\/)?\d{6,9}\/?$/i.test(url.pathname))
    return 'bestbuy-ca';
  if (host === 'newegg.ca' && /^\/(?:[A-Za-z0-9-]+\/)?p\/[^/]+\/?$/i.test(url.pathname))
    return 'newegg-ca';
  if (host === 'walmart.ca' && /^\/(?:en|fr)\/ip\/(?:[^/]+\/)?[A-Z0-9]+\/?$/i.test(url.pathname))
    return 'walmart-ca';
  // Canadian Tire and SportChek share one storefront platform.
  if (ctcProductCode(value)) return 'ctc-ca';
  if (homeDepotProductId(value)) return 'homedepot-ca';
  if (targetTcin(value)) return 'target-com';
  return undefined;
}
