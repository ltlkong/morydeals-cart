import { z } from 'zod';
import type { PageDocument, ParseResult } from '../types.ts';
import { PARSER_VERSION } from '../version.ts';
import { resolveCurrency } from '../currency.ts';
import { toMinorUnits, currencyDecimals } from '../money.ts';
import { aggregateRating, variant as productVariant } from '../shared/facts.ts';

const identifier = z
  .union([z.string().regex(/^\d+$/), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)])
  .transform(String);
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const variantSchema = z.object({
  id: identifier,
  title: z.string().min(1),
  name: z.string().optional(),
  sku: z.string().nullable().optional(),
  price: amount,
  compare_at_price: amount.nullable().optional(),
  available: z.boolean(),
  featured_image: z.object({ src: z.string() }).nullable().optional(),
  /** The variant's option values in the product's option order (Liquid `variant.options`). */
  options: z.array(z.string()).optional(),
  option1: z.string().nullable().optional(),
  option2: z.string().nullable().optional(),
  option3: z.string().nullable().optional(),
});
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;
const list = (value: unknown): unknown[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];
function nodes(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 30) return [];
  if (Array.isArray(value)) return value.flatMap((v) => nodes(v, depth + 1));
  const node = record(value);
  return [
    node,
    ...Object.values(node)
      .filter((v) => v && typeof v === 'object')
      .flatMap((v) => nodes(v, depth + 1)),
  ];
}
function sameProduct(value: unknown, page: URL): boolean {
  try {
    if (!text(value)) return false;
    const other = new URL(String(value), page);
    return (
      other.origin === page.origin &&
      other.pathname.replace(/\/$/, '') === page.pathname.replace(/\/$/, '')
    );
  } catch {
    return false;
  }
}
// Shopify Liquid amounts use hundredths even for zero-decimal currencies such as JPY.
function shopifyMinor(value: number, currency: string) {
  if (currencyDecimals(currency) !== 0) return value;
  const n = BigInt(value);
  return toMinorUnits(`${n / 100n}.${String(n % 100n).padStart(2, '0')}`, currency);
}

/**
 * Themes without product JSON (Roborock) still publish JSON-LD. A product whose offers all name one variant is a
 * single-variant product: that variant is the selection, never a guess among siblings.
 */
function jsonLdVariant(document: PageDocument, url: URL, requested: string | undefined) {
  const offers = nodes(document.jsonLd)
    .filter(
      (n) =>
        list(n['@type']).some((t) => typeof t === 'string' && /(?:^|\/)Product$/.test(t)) &&
        sameProduct(n.url, url),
    )
    .flatMap((product) => list(product.offers).map((offer) => ({ product, offer: record(offer) })));
  const ids = new Set(
    offers.map(({ offer }) => {
      try {
        return sameProduct(offer.url, url)
          ? new URL(String(offer.url), url).searchParams.get('variant')
          : null;
      } catch {
        return null;
      }
    }),
  );
  if (offers.length === 0 || ids.size !== 1) return;
  const [id] = ids;
  if (!id || (requested && id !== requested)) return;
  const { product, offer } = offers[0];
  // Liquid amounts are hundredths of the displayed unit.
  const hundredths = toMinorUnits(
    typeof offer.price === 'number' ? String(offer.price) : offer.price,
    'USD',
  );
  const pictures = list(product.image).flatMap((value) => {
    const src = text(value) ?? text(record(value).url);
    return src ? [src] : [];
  });
  const image = pictures[0];
  const parsed = variantSchema.safeParse({
    id,
    title: 'Default Title',
    price: hundredths,
    compare_at_price: null,
    available: /InStock|LimitedAvailability|OnlineOnly|PreOrder/.test(String(offer.availability)),
    featured_image: image ? { src: image } : null,
  });
  if (!parsed.success) return;
  return {
    variant: parsed.data,
    source: 'jsonLd.offers[0]',
    title: text(product.name),
    brand: text(record(product.brand).name) ?? text(product.brand),
    // One variant: every product image is its own.
    gallery: pictures,
  };
}

/**
 * The product's photos that belong to every variant: the full product JSON's images, less any that is another
 * variant's featured photo (a sibling colour).
 */
function sharedImages(document: PageDocument, url: URL, variantId: string): string[] {
  for (const entry of document.embeddedProducts ?? []) {
    if (entry.kind !== 'product') continue;
    const product = record(entry.value);
    if (
      !sameProduct(
        product.url ?? (text(product.handle) ? `/products/${product.handle}` : undefined),
        url,
      )
    )
      continue;
    const siblings = new Set(
      list(product.variants)
        .map(record)
        .filter((v) => String(v.id) !== variantId)
        .flatMap((v) => {
          const src = text(record(v.featured_image).src);
          return src ? [src] : [];
        }),
    );
    return list(product.images).flatMap((value) => {
      const src = text(value) ?? text(record(value).src);
      return src && !siblings.has(src) ? [src] : [];
    });
  }
  return [];
}

/** The product's option names (Colour, Storage) from its full product JSON, in order. */
function optionNames(document: PageDocument, url: URL): string[] {
  for (const entry of document.embeddedProducts ?? []) {
    if (entry.kind !== 'product') continue;
    const product = record(entry.value);
    if (
      !sameProduct(
        product.url ?? (text(product.handle) ? `/products/${product.handle}` : undefined),
        url,
      )
    )
      continue;
    const names = list(product.options_with_values ?? product.options).map(
      (option) => text(option) ?? text(record(option).name),
    );
    if (names.every(Boolean)) return names as string[];
  }
  return [];
}
/** The selected variant's options, named by the product's options (or by position when the page has no names). */
function selectedOptions(
  document: PageDocument,
  url: URL,
  variant: z.infer<typeof variantSchema>,
  source: string,
) {
  const values = variant.options ?? [variant.option1, variant.option2, variant.option3];
  const present = values.filter((v): v is string => !!v);
  if (!present.length) return;
  const names = optionNames(document, url);
  return productVariant(
    present.map((value, i) => ({
      name: names[i] ?? (present.length === 1 ? 'Option' : `Option ${i + 1}`),
      value,
    })),
    source,
    variant.id,
  );
}

/** Deterministic extraction of the requested leaf variant; no first-variant guessing. */
export function parseShopifyLiquid(document: PageDocument): ParseResult {
  const base = { parserVersion: PARSER_VERSION, strategy: 'shopify' };
  const failure = (issue: string): ParseResult => ({
    ...base,
    status: 'needs_review',
    products: [],
    issues: [issue],
  });
  const url = new URL(document.url);
  const requestUrl = new URL(document.requestedUrl ?? document.url);
  if (!/\/products\/[^/]+/.test(url.pathname)) return failure('Not a Shopify product page');
  if (
    requestUrl.origin !== url.origin ||
    requestUrl.pathname.replace(/\/$/, '') !== url.pathname.replace(/\/$/, '')
  )
    return failure('Shopify redirected to another product');
  const selections = requestUrl.searchParams.getAll('variant');
  if (selections.length > 1 || selections.some((v) => !/^[1-9]\d*$/.test(v)))
    return failure('Invalid or ambiguous Shopify variant');
  const requested = selections[0];
  if (requested && url.searchParams.has('variant') && url.searchParams.get('variant') !== requested)
    return failure('Shopify redirected to another variant');
  const candidates: {
    variant: z.infer<typeof variantSchema>;
    source: string;
    title?: string;
    brand?: string;
    gallery?: string[];
  }[] = [];
  for (const entry of document.embeddedProducts ?? []) {
    const product = record(entry.value);
    if (
      entry.kind === 'product' &&
      !sameProduct(
        product.url ?? (text(product.handle) ? `/products/${product.handle}` : undefined),
        url,
      )
    )
      continue;
    const values = entry.kind === 'selected-variant' ? [entry.value] : list(product.variants);
    for (const [index, value] of values.entries()) {
      const parsed = variantSchema.safeParse(value);
      if (!parsed.success) continue;
      if (
        requested
          ? parsed.data.id !== requested
          : entry.kind !== 'selected-variant' && values.length !== 1
      )
        continue;
      candidates.push({
        variant: parsed.data,
        source: entry.source + (entry.kind === 'product' ? `.variants[${index}]` : ''),
        title: text(product.title),
        brand: text(product.vendor),
      });
    }
  }
  if (!candidates.length) {
    const single = jsonLdVariant(document, url, requested);
    if (single) candidates.push(single);
  }
  if (!candidates.length) return failure('Requested Shopify variant is missing or invalid');
  const signatures = new Set(
    candidates.map(({ variant: v }) =>
      JSON.stringify([v.id, v.price, v.compare_at_price ?? null, v.sku ?? null, v.available]),
    ),
  );
  if (signatures.size !== 1) return failure('Conflicting Shopify variant snapshots');
  const { variant, source, title: parentTitle, brand, gallery } = candidates[0];
  const products = nodes(document.jsonLd).filter(
    (n) =>
      list(n['@type']).some((t) => typeof t === 'string' && /(?:^|\/)Product$/.test(t)) &&
      sameProduct(n.url, url),
  );
  const offers = products
    .flatMap((p) => list(p.offers).map(record))
    .filter((o) => {
      if (!sameProduct(o.url, url)) return false;
      return new URL(String(o.url), url).searchParams.get('variant') === variant.id;
    });
  const declared = offers.map((o) => o.priceCurrency).filter((v) => v != null);
  if (!declared.length)
    declared.push(
      ...(document.metadata['product:price:currency'] ??
        document.metadata['og:price:currency'] ??
        []),
    );
  const currencies = declared.map((v) =>
    resolveCurrency(
      v,
      offers.length ? `jsonLd.offer.variant:${variant.id}` : 'metadata.product-currency',
      document.url,
    ),
  );
  if (currencies.some((c) => !c) || new Set(currencies.map((c) => c?.currency)).size > 1)
    return failure('Conflicting or invalid Shopify currency');
  const currency = currencies[0] ?? resolveCurrency(undefined, '', document.url);
  if (!currency) return failure('Shopify presentment currency is unknown');
  const price = shopifyMinor(variant.price, currency.currency);
  const former =
    variant.compare_at_price == null
      ? undefined
      : shopifyMinor(variant.compare_at_price, currency.currency);
  if (price === undefined || (variant.compare_at_price != null && former === undefined))
    return failure('Shopify amount cannot be represented in currency minor units');
  if (offers.some((o) => o.price != null && toMinorUnits(o.price, currency.currency) !== price))
    return failure('Shopify variant price conflicts with its JSON-LD offer');
  const issues: string[] = [];
  if (former !== undefined && former > 0 && former < price)
    issues.push('Shopify compare-at price is below current price; omitted');
  const parent = products[0] ?? {};
  const title =
    variant.name ??
    [
      text(parent.name) ?? parentTitle,
      variant.title === 'Default Title' ? undefined : variant.title,
    ]
      .filter(Boolean)
      .join(' - ');
  if (!title) return failure('Shopify product title is missing');
  const images: string[] = [];
  for (const src of [
    variant.featured_image?.src,
    ...(gallery ?? sharedImages(document, url, variant.id)),
  ]) {
    if (!src) continue;
    try {
      const image = new URL(src, url);
      if (
        ['https:', 'http:'].includes(image.protocol) &&
        !image.username &&
        !image.password &&
        !images.includes(image.href)
      )
        images.push(image.href);
    } catch {
      /* A missing image is preferable to a different color's image. */
    }
  }
  const options = selectedOptions(document, url, variant, source);
  const stars = products
    .map((p, i) => aggregateRating(p.aggregateRating, `jsonLd.Product[${i}].aggregateRating`))
    .find(Boolean);
  url.searchParams.set('variant', variant.id);
  url.hash = '';
  return {
    ...base,
    status: 'parsed',
    issues,
    products: [
      {
        url: url.href,
        title,
        variantId: variant.id,
        ...(options ? { variant: options } : {}),
        ...(stars ? { rating: stars } : {}),
        sku: variant.sku || undefined,
        brand: brand ?? text(record(parent.brand).name) ?? text(parent.brand),
        images,
        evidence: source,
        offers: [
          {
            amountMinor: price,
            currency: currency.currency,
            currencyEvidence: currency.evidence,
            ...(former !== undefined && former > price
              ? {
                  compareAtAmountMinor: former,
                  compareAtEvidence: `${source}.compare_at_price`,
                }
              : {}),
            availability: variant.available ? 'InStock' : 'OutOfStock',
            url: url.href,
            evidence: `${source}.price`,
          },
        ],
      },
    ],
  };
}
