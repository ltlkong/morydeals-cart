import { htmlDocument, one } from '../shared/html.ts';

/**
 * The Amazon storefronts the parser reads: each states prices in its own currency with a dot decimal mark, so a
 * price label must be a full amount in that currency ("$95.99", "CDN$ 95.99", "£19.99"). Storefronts with a
 * comma decimal mark (amazon.de, .fr, .it, .es) or no minor unit (amazon.co.jp) are not supported.
 */
export type AmazonStore = { host: string; currency: string; price: RegExp };
const AMOUNT = String.raw`(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?`;
const store = (host: string, currency: string, symbol: string): AmazonStore => ({
  host,
  currency,
  price: new RegExp(`^(?:${symbol}\\s*|${currency}\\s+)?${AMOUNT}(?:\\s*${currency})?$`),
});
const STORES = [
  store('amazon.ca', 'CAD', String.raw`(?:CAD|CDN|CA|C)?\s*\$`),
  store('amazon.com', 'USD', String.raw`(?:USD|US)?\s*\$`),
  store('amazon.co.uk', 'GBP', '£'),
  store('amazon.com.au', 'AUD', String.raw`(?:AUD|AU|A)?\s*\$`),
];
/**
 * The storefront as the page shows it: a visitor from abroad sees amazon.com prices converted to the currency of
 * preference the page states ("CAD 117.39"); the offers are in that currency.
 */
export function displayedStore(store: AmazonStore, preferred: string[]): AmazonStore {
  const [currency] = [...new Set(preferred)];
  if (!currency || preferred.some((value) => value !== currency) || currency === store.currency)
    return store;
  if (!/^[A-Z]{3}$/.test(currency)) return store;
  const own = STORES.find((candidate) => candidate.currency === currency);
  return {
    host: store.host,
    currency,
    price: own?.price ?? new RegExp(`^${currency}\\s*${AMOUNT}$`),
  };
}
/** The storefront an Amazon URL is on (exact host, no port or credentials), else undefined. */
export function amazonStore(value: string): AmazonStore | undefined {
  try {
    const url = new URL(value);
    if (url.port || url.username || url.password || !['https:', 'http:'].includes(url.protocol))
      return;
    const host = url.hostname.replace(/^www\./, '');
    return STORES.find((candidate) => candidate.host === host);
  } catch {
    return;
  }
}

/** Classify Amazon's own verification document before extracting product facts. */
export function amazonPageChallenge(
  url: string,
  status: number,
  html?: string,
): string | undefined {
  if (!amazonStore(url)) return;
  if (status === 202) return 'Amazon verification response (HTTP 202)';
  if (
    new URL(url).pathname === '/_sec/verify' ||
    html?.includes('/_sec/verify?provider=interstitial')
  )
    return 'Amazon verification interstitial';
  if (!html) return;
  const root = htmlDocument(html);
  if (
    one(
      root,
      '#captchacharacters, form[action*="validateCaptcha"], form[action*="/_sec/verify"], iframe[src*="/_sec/verify"]',
    )
  )
    return 'Amazon verification page';
}
