import type { PageDocument, Offer, Product, ParseResult, ParserStrategy } from './types.ts';

import { toMinorUnits } from './money.ts';
import { resolveCurrency } from './currency.ts';
import {
  aggregateRating,
  identityUrl,
  promotion,
  rating,
  schemaAvailability,
  schemaCondition,
  variant,
} from './shared/facts.ts';

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

/** schema.org properties that commonly name what a variant varies by. */
const VARIANT_PROPERTIES = [
  'color',
  'size',
  'material',
  'pattern',
  'suggestedAge',
  'suggestedGender',
];
const propertyName = (key: string) =>
  key.replace(/^https?:\/\/schema\.org\//, '').replace(/^\w/, (c) => c.toUpperCase());
/**
 * The options of a ProductGroup variant: the properties its group says it varies by (variesBy), or else the
 * common variant properties it states, plus any named additionalProperty listed in variesBy.
 */
function productVariant(
  value: ObjectValue,
  group: ObjectValue | undefined,
  path: string,
  sku: string | undefined,
): Product['variant'] {
  if (!group) return;
  const varies = list(group.variesBy).flatMap((v) => {
    const key = text(v)?.replace(/^https?:\/\/schema\.org\//, '');
    return key ? [key] : [];
  });
  const keys = varies.length ? varies : VARIANT_PROPERTIES;
  const extra = list(value.additionalProperty).map(object);
  const options = keys.map((key) => {
    const own = value[key];
    if (own !== undefined) return { name: propertyName(key), value: named(own) };
    const property = extra.find((p) => text(p.name)?.toLowerCase() === key.toLowerCase());
    return { name: text(property?.name), value: named(property?.value) };
  });
  return variant(options, path, sku ?? text(value.productID));
}
/** An offer as read, with what it says about its variant (kept only while choosing the selected one). */
type Quoted = Offer & { sku?: string; options?: { name?: string; value?: string }[] };
/** What a variant's own offer says it is: its item's variant properties, or else the offer's name. */
function offerOptions(offer: ObjectValue, item: ObjectValue) {
  const options = VARIANT_PROPERTIES.flatMap((key) =>
    item[key] !== undefined ? [{ name: propertyName(key), value: named(item[key]) }] : [],
  );
  if (options.length) return options;
  const name = text(offer.name) ?? text(item.name);
  return name ? [{ name: 'Option', value: name }] : [];
}
const ratingOf = (value: ObjectValue, group: ObjectValue | undefined, path: string) => {
  const own = aggregateRating(value.aggregateRating, `${path}.aggregateRating`);
  const shared = group
    ? aggregateRating(group.aggregateRating, 'ProductGroup.aggregateRating')
    : undefined;
  const found = own ?? shared;
  return found ? { rating: found } : {};
};

function parseSources(document: PageDocument, strategy: string): ParseResult {
  const issues: string[] = [];
  const nodes: { value: ObjectValue; path: string; group?: ObjectValue }[] = [];
  const ids = new Map<string, ObjectValue>();
  function walk(value: unknown, path: string, depth = 0, group?: ObjectValue) {
    if (depth > 30) {
      issues.push('JSON-LD depth limit reached');
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1, group));
      return;
    }
    const node = object(value);
    if (!Object.keys(node).length) return;
    nodes.push({ value: node, path, group });
    if (text(node['@id']) && Object.keys(node).length > 1) ids.set(String(node['@id']), node);
    // A ProductGroup's hasVariant entries are its variants: they inherit its name, rating and variesBy.
    for (const [key, child] of Object.entries(node))
      if (typeof child === 'object')
        walk(
          child,
          `${path}.${key}`,
          depth + 1,
          key === 'hasVariant' && isType(node, 'ProductGroup') ? node : undefined,
        );
  }
  if (strategy === 'schema-org') document.jsonLd.forEach((value, i) => walk(value, `jsonLd[${i}]`));
  function resolve(value: unknown): ObjectValue {
    const node = object(value);
    return typeof node['@id'] === 'string' ? { ...ids.get(node['@id']), ...node } : node;
  }
  function offers(value: unknown, path: string): Quoted[] {
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
          availability: schemaAvailability(offer.availability),
          ...(schemaCondition(offer.itemCondition)
            ? { condition: schemaCondition(offer.itemCondition) }
            : {}),
          seller: named(offer.seller),
          sku: text(offer.sku) ?? text(resolve(offer.itemOffered).sku),
          options: offerOptions(offer, resolve(offer.itemOffered)),
          validUntil: text(offer.priceValidUntil),
          ...saleEnd(offer, specification, compareAt, price, `${path}[${i}]`),
          evidence: `${path}[${i}]`,
        },
      ];
    });
  }
  /**
   * A sale with a stated end: the struck price beside an offer whose sale price (or the offer itself) is valid
   * through an instant with its zone (`validThrough` / `validUntil`). `priceValidUntil` is not read: themes fill it
   * with a far-off date as boilerplate, and a bare date has no zone to count down to.
   */
  function saleEnd(
    offer: ObjectValue,
    specification: ObjectValue,
    compareAt: number | undefined,
    price: number,
    path: string,
  ) {
    if (compareAt === undefined || compareAt <= price) return {};
    const sale = promotion('sale', 'Sale', `${path}.validThrough`, {
      validUntil:
        text(specification.validThrough) ??
        text(specification.validUntil) ??
        text(offer.validThrough),
    });
    return sale?.validUntil ? { promotions: [sale] } : {};
  }
  const seen = new Set<string>();
  const page = identityUrl(document.url);
  const requested = identityUrl(document.requestedUrl ?? document.url);
  const here = (url: string | undefined) => !!url && [page, requested].includes(identityUrl(url));
  let products: Product[] = nodes
    .filter((n) => isType(n.value, 'Product'))
    .flatMap(({ value, path, group }) => {
      // Ignore @id references; include full Product nodes only once.
      const title = text(value.name) ?? text(group?.name);
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
      let quoted = offers(value.offers, `${path}.offers`);
      let productUrl = url;
      let sku = text(value.sku);
      let selection: Product['variant'];
      // One Product listing each variant as its own offer (its own SKU or URL): only the offer for the variant
      // this page shows is this product's price, never the others'.
      const distinct = (key: 'sku' | 'url') =>
        new Set(quoted.map((o) => o[key]).filter(Boolean)).size > 1;
      if (quoted.length > 1 && (distinct('sku') || distinct('url'))) {
        const params = new URL(document.requestedUrl ?? document.url).searchParams;
        const chosen = quoted.filter(
          (o) =>
            here(o.url) || (!!o.sku && ['sku', 'variant'].some((k) => params.get(k) === o.sku)),
        );
        if (chosen.length !== 1) {
          issues.push(`${path}.offers: variant offers with no selected variant`);
          return [];
        }
        const offer = chosen[0];
        quoted = [offer];
        productUrl = offer.url ?? url;
        sku = offer.sku ?? sku;
        selection = variant(offer.options ?? [], offer.evidence, sku);
      }
      selection ??= productVariant(value, group, path, sku);
      return [
        {
          url: productUrl,
          title,
          description: text(value.description) ?? text(group?.description),
          brand: named(value.brand) ?? named(group?.brand),
          sku,
          ...(selection ? { variant: selection } : {}),
          ...ratingOf(value, group, path),
          images: [...new Set(images)],
          offers: quoted.map(({ sku: _sku, options: _options, ...offer }) => offer),
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
    // Microdata published as <meta itemprop> (availability, ratingValue, reviewCount) is read the same way.
    const availability = schemaAvailability(
      meta('product:availability') ?? meta('og:availability') ?? meta('availability'),
    );
    const stars = meta('ratingvalue')
      ? rating(
          {
            value: meta('ratingvalue'),
            scale: meta('bestrating'),
            count: meta('ratingcount') ?? meta('reviewcount'),
          },
          'metadata.itemprop:ratingValue',
        )
      : undefined;
    if (title)
      products = [
        {
          url: document.url,
          title,
          ...(stars ? { rating: stars } : {}),
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
                    ...(availability ? { availability } : {}),
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
  const matching = products.filter((p) => here(p.url));
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
