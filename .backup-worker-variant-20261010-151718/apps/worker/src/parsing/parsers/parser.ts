import type { PageDocument, Offer, Product, ParseResult, ParserStrategy } from './types.ts';

import { toMinorUnits } from './money.ts';
import { resolveCurrency } from './currency.ts';

import { PARSER_VERSION } from './version.ts';
export { PARSER_VERSION } from './version.ts';
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
const list = (value: unknown): unknown[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];
const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;
const named = (value: unknown): string | undefined => text(value) ?? text(object(value).name);
const isType = (value: ObjectValue, type: string) =>
  list(value['@type']).some(
    (t) => typeof t === 'string' && t.replace(/^https?:\/\/schema.org\//, '') === type,
  );

function webUrl(value: unknown, base: string): string | undefined {
  try {
    const url = new URL(text(value) ?? '', base);
    if (!text(value) || !['https:', 'http:'].includes(url.protocol) || url.username || url.password)
      return;
    url.hash = '';
    return url.href;
  } catch {
    return;
  }
}

function parseSources(document: PageDocument, strategy: string): ParseResult {
  const issues: string[] = [];
  const nodes: { value: ObjectValue; path: string }[] = [];
  const ids = new Map<string, ObjectValue>();
  function walk(value: unknown, path: string, depth = 0) {
    if (depth > 30) {
      issues.push('JSON-LD depth limit reached');
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1));
      return;
    }
    const node = object(value);
    if (!Object.keys(node).length) return;
    nodes.push({ value: node, path });
    if (text(node['@id']) && Object.keys(node).length > 1) ids.set(String(node['@id']), node);
    for (const [key, child] of Object.entries(node))
      if (typeof child === 'object') walk(child, `${path}.${key}`, depth + 1);
  }
  if (strategy === 'schema-org') document.jsonLd.forEach((value, i) => walk(value, `jsonLd[${i}]`));
  function resolve(value: unknown): ObjectValue {
    const node = object(value);
    return typeof node['@id'] === 'string' ? { ...ids.get(node['@id']), ...node } : node;
  }
  function offers(value: unknown, path: string): Offer[] {
    return list(value).flatMap((raw, i) => {
      const offer = resolve(raw);
      if (isType(offer, 'AggregateOffer')) {
        if (!offer.offers)
          issues.push(`${path}[${i}]: price range retained in source; not a purchasable quote`);
        return offers(offer.offers, `${path}[${i}].offers`);
      }
      const specifications = list(offer.priceSpecification).map(resolve);
      const isFormer = (s: ObjectValue) =>
        text(s.priceType)?.split('/').pop() === 'StrikethroughPrice';
      const specification = specifications.find((s) => s.price !== undefined && !isFormer(s)) ?? {};
      const resolvedCurrency = resolveCurrency(
        offer.priceCurrency ?? specification.priceCurrency,
        `${path}[${i}].priceCurrency`,
        document.url,
      );
      const price =
        resolvedCurrency &&
        toMinorUnits(offer.price ?? specification.price, resolvedCurrency.currency);
      if (price === undefined || price === 0 || !resolvedCurrency) {
        issues.push(`${path}[${i}]: missing or invalid price/currency`);
        return [];
      }
      const formerIndex = specifications.findIndex(isFormer);
      const former = specifications[formerIndex];
      const formerCurrency = former?.priceCurrency ?? resolvedCurrency.currency;
      const compareAt =
        former && formerCurrency === resolvedCurrency.currency
          ? toMinorUnits(former.price, resolvedCurrency.currency)
          : undefined;
      if (former && (compareAt === undefined || compareAt <= price))
        issues.push(`${path}[${i}]: invalid strikethrough price`);
      return [
        {
          amountMinor: price,
          currency: resolvedCurrency.currency,
          currencyEvidence: resolvedCurrency.evidence,
          ...(compareAt !== undefined && compareAt > price
            ? {
                compareAtAmountMinor: compareAt,
                compareAtEvidence: `${path}[${i}].priceSpecification[${formerIndex}]`,
              }
            : {}),
          url: webUrl(offer.url, document.url),
          availability: text(offer.availability)?.split('/').pop(),
          seller: named(offer.seller),
          validUntil: text(offer.priceValidUntil),
          evidence: `${path}[${i}]`,
        },
      ];
    });
  }
  const seen = new Set<string>();
  let products: Product[] = nodes
    .filter((n) => isType(n.value, 'Product'))
    .flatMap(({ value, path }) => {
      // Ignore @id references; include full Product nodes only once.
      const title = text(value.name);
      if (!title) return [];
      const url = webUrl(value.url, document.url) ?? document.url;
      const identity = text(value['@id']) ?? `${url}\n${text(value.sku) ?? ''}\n${title}`;
      if (seen.has(identity)) return [];
      seen.add(identity);
      const images = list(value.image).flatMap((img) => {
        const image = webUrl(
          typeof img === 'string' ? img : (object(img).url ?? object(img).contentUrl),
          document.url,
        );
        return image ? [image] : [];
      });
      return [
        {
          url,
          title,
          description: text(value.description),
          brand: named(value.brand),
          sku: text(value.sku),
          images: [...new Set(images)],
          offers: offers(value.offers, `${path}.offers`),
          evidence: path,
        },
      ];
    });
  const meta = (key: string) => document.metadata[key]?.[0];
  if (
    strategy === 'open-graph' &&
    (meta('og:type') === 'product' || meta('product:price:amount'))
  ) {
    const title = meta('og:title') ?? meta('title');
    const code = resolveCurrency(
      meta('product:price:currency') ?? meta('og:price:currency'),
      'metadata.product:price:currency',
      document.url,
    );
    const price =
      code && toMinorUnits(meta('product:price:amount') ?? meta('og:price:amount'), code.currency);
    if (title)
      products = [
        {
          url: document.url,
          title,
          description: meta('og:description') ?? meta('description'),
          images: (document.metadata['og:image'] ?? []).flatMap((v) =>
            webUrl(v, document.url) ? [webUrl(v, document.url)!] : [],
          ),
          offers:
            price !== undefined && price > 0 && code
              ? [
                  {
                    amountMinor: price,
                    currency: code.currency,
                    currencyEvidence: code.evidence,
                    evidence: 'metadata.product:price',
                  },
                ]
              : [],
          evidence: 'metadata',
        },
      ];
    if (price === undefined || price === 0 || !code)
      issues.push('Product metadata has no valid price/currency');
  }
  if (!products.length)
    issues.push('No explicit product data found; requires a site adapter or rendered capture');
  if (products.some((p) => !p.offers.length))
    issues.push('At least one product has no concrete priced offer');
  // Multiple unrelated products may be recommendations. Preserve them for review without asserting a current price.
  const distinctUrls = new Set(products.map((p) => p.url));
  const matching = products.filter((p) => p.url === document.url);
  if (distinctUrls.size > 1 && matching.length) products = matching;
  const ambiguous = distinctUrls.size > 1 && !matching.length;
  if (ambiguous) issues.push('Multiple product URLs with no exact page match');
  if (new Set(products.map((p) => p.url)).size !== products.length) {
    return {
      parserVersion: PARSER_VERSION,
      strategy,
      status: 'needs_review',
      products: [],
      issues: [...issues, 'Multiple variants share one URL; explicit variant URLs are required'],
    };
  }
  return {
    parserVersion: PARSER_VERSION,
    strategy,
    status:
      products.length && products.every((p) => p.offers.length) && !ambiguous
        ? 'parsed'
        : 'needs_review',
    products,
    issues: [...new Set(issues)],
  };
}

export const jsonLdStrategy: ParserStrategy = {
  id: 'schema-org',
  parse: (document) => parseSources(document, 'schema-org'),
};
export const openGraphStrategy: ParserStrategy = {
  id: 'open-graph',
  parse: (document) => parseSources(document, 'open-graph'),
};

// Site-specific strategies can precede the defaults. No strategy invents a price from arbitrary page text.
export function parseProductDocument(
  document: PageDocument,
  strategies: readonly ParserStrategy[] = [jsonLdStrategy, openGraphStrategy],
): ParseResult {
  const failures: string[] = [];
  for (const strategy of strategies) {
    const result = strategy.parse(document);
    if (result.products.length) return { ...result, strategy: strategy.id };
    failures.push(...result.issues);
  }
  return {
    parserVersion: PARSER_VERSION,
    strategy: 'none',
    status: 'needs_review',
    products: [],
    issues: [...new Set(failures)],
  };
}
