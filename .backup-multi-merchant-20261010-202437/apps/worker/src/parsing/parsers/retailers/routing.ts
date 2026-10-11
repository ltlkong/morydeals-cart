export type Retailer = 'amazon-ca' | 'bestbuy-ca' | 'newegg-ca' | 'walmart-ca';
/** Exact hosts and supported product paths; a tracking query cannot impersonate a merchant. */
export function retailerForUrl(value: string): Retailer | undefined {
  const url = new URL(value);
  if (url.port || url.username || url.password) return;
  const host = url.hostname.replace(/^www\./, '');
  if (
    host === 'amazon.ca' &&
    /\/(?:dp|gp\/product|gp\/aw\/d)\/[A-Z0-9]{10}(?:\/|$)/i.test(url.pathname)
  )
    return 'amazon-ca';
  if (host === 'bestbuy.ca' && /^\/en-ca\/product\/(?:[^/]+\/)?\d{6,9}\/?$/i.test(url.pathname))
    return 'bestbuy-ca';
  if (host === 'newegg.ca' && /^\/(?:[A-Za-z0-9-]+\/)?p\/[^/]+\/?$/i.test(url.pathname))
    return 'newegg-ca';
  if (host === 'walmart.ca' && /^\/(?:en|fr)\/ip\/(?:[^/]+\/)?[A-Z0-9]+\/?$/i.test(url.pathname))
    return 'walmart-ca';
  return undefined;
}
