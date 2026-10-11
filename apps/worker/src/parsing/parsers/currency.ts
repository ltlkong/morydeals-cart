import { currencyCode } from './money.ts';

export interface CurrencyEvidence {
  currency: string;
  evidence: string;
}

export function storefrontCurrency(url: string): CurrencyEvidence | undefined {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    // Market tokens must occupy a hostname label or the leading locale segment.
    // Product names, arbitrary substrings and query values are not market evidence.
    if (host.endsWith('.ca') || host.startsWith('ca.'))
      return { currency: 'CAD', evidence: `storefront:${host}` };
    const locale = parsed.pathname.split('/')[1]?.toLowerCase();
    if (locale === 'en-ca' || locale === 'fr-ca' || locale === 'ca')
      return { currency: 'CAD', evidence: `url-locale:${locale}` };
  } catch {
    /* Invalid URLs have no storefront currency. */
  }
  return;
}

/** Page-declared currency takes precedence over a known storefront default. */
export function resolveCurrency(
  value: unknown,
  evidence: string,
  url: string,
): CurrencyEvidence | undefined {
  if (value !== undefined && value !== null && value !== '') {
    const currency = currencyCode(value);
    return currency ? { currency, evidence } : undefined;
  }
  return storefrontCurrency(url);
}

/** Dollar prefixes that name their currency, e.g. SHEIN's CA$. */
const DOLLAR_PREFIXES: Record<string, string> = {
  CA: 'CAD',
  C: 'CAD',
  US: 'USD',
  AU: 'AUD',
  A: 'AUD',
};
export function quotedCurrency(quote: string): string | null | undefined {
  // Two-letter prefixes may follow a label ("FromCA$3.29"); single letters must stand alone.
  const prefixed = [...quote.matchAll(/(CA|US|AU)\$|(?<![A-Za-z])(C|A)\$/g)].map(
    (match) => DOLLAR_PREFIXES[match[1] ?? match[2]],
  );
  const codes = [
    ...new Set([
      ...(quote.match(/\b[A-Z]{3}\b/g) ?? []).filter((code) => currencyCode(code)),
      ...prefixed,
    ]),
  ];
  return codes.length > 1 ? null : codes[0];
}
