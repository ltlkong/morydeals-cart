import { identityUrl } from '@morydeals/capture-contracts';
import type {
  Condition,
  ParseResult,
  Promotion,
  Product,
  ProductRating,
  ProductVariant,
  VariantOption,
} from '../types.ts';

const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ') : undefined;

/**
 * The stock states the worker records, as schema.org ItemAvailability names. A source value outside this map is
 * left unknown rather than guessed.
 */
export const AVAILABILITY = [
  'InStock',
  'OutOfStock',
  'PreOrder',
  'BackOrder',
  'LimitedAvailability',
  'Discontinued',
] as const;
const AVAILABILITY_SYNONYMS: Record<string, (typeof AVAILABILITY)[number]> = {
  instock: 'InStock',
  onlineonly: 'InStock',
  available: 'InStock',
  outofstock: 'OutOfStock',
  soldout: 'OutOfStock',
  unavailable: 'OutOfStock',
  preorder: 'PreOrder',
  presale: 'PreOrder',
  backorder: 'BackOrder',
  limitedavailability: 'LimitedAvailability',
  instoreonly: 'LimitedAvailability',
  discontinued: 'Discontinued',
};
/** schema.org ItemAvailability (a URL, a bare name or the same words spaced) → its name; else undefined. */
export function schemaAvailability(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return;
  const key = raw
    .replace(/^https?:\/\/schema\.org\//i, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return AVAILABILITY_SYNONYMS[key];
}

const CONDITIONS: Record<string, Condition> = {
  newcondition: 'new',
  new: 'new',
  brandnew: 'new',
  usedcondition: 'used',
  used: 'used',
  preowned: 'used',
  refurbishedcondition: 'renewed',
  refurbished: 'renewed',
  renewed: 'renewed',
  reconditioned: 'renewed',
  damagedcondition: 'damaged',
  damaged: 'damaged',
  openbox: 'open_box',
};
/** schema.org itemCondition (URL or name) or a store's single condition word → Condition; else undefined. */
export function schemaCondition(value: unknown): Condition | undefined {
  const raw = text(value);
  if (!raw) return;
  return CONDITIONS[
    raw
      .replace(/^https?:\/\/schema\.org\//i, '')
      .toLowerCase()
      .replace(/[^a-z]/g, '')
  ];
}
/** A condition stated in a sentence or title ("Renewed", "Open Box", "Used - Like New"); else undefined. */
export function conditionInText(value: string | undefined): Condition | undefined {
  if (!value) return;
  if (/\bopen[- ]box\b/i.test(value)) return 'open_box';
  if (/\b(?:renewed|refurbished|reconditioned)\b/i.test(value)) return 'renewed';
  if (/\b(?:used|pre[- ]owned)\b/i.test(value)) return 'used';
  if (/\bdamaged\b/i.test(value)) return 'damaged';
  return undefined;
}

/**
 * A promotion with shopper-facing text: words (not a bare number), short, and not a field name or JSON. Anything
 * else is no promotion (morydeals-price `source_promotion` applies the same rule).
 */
const UNIT_MS: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 };
/**
 * A running countdown's remaining time in ms: "Ends in 5h 12m", "5 hours 12 minutes", "05:12:33", "1 day 3 hrs".
 * A countdown without hours, minutes or seconds ("Ends in 2 days") is too coarse to time a deal by, and gives none.
 */
export function countdownMs(value: string | undefined): number | undefined {
  if (!value || /NO_OF_/i.test(value)) return;
  const clock = /\b(\d{1,3}):([0-5]\d):([0-5]\d)\b/.exec(value);
  let total = 0;
  let fine = false;
  if (clock) {
    total = (+clock[1] * 3600 + +clock[2] * 60 + +clock[3]) * 1000;
    fine = true;
  }
  const rest = clock ? value.replace(clock[0], ' ') : value;
  for (const match of rest.matchAll(
    /(\d{1,4})\s*(d|days?|h|hrs?|hours?|m|mins?|minutes?|s|secs?|seconds?)\b/gi,
  )) {
    const unit = match[2][0].toLowerCase();
    total += +match[1] * UNIT_MS[unit];
    if (unit !== 'd') fine = true;
  }
  return fine && total > 0 && total < 30 * UNIT_MS.d ? total : undefined;
}
/** A countdown's end: the capture time plus the time it showed left (see countdownMs), as a UTC instant. */
export function countdownEnd(value: string | undefined, capturedAt: string | undefined) {
  const left = countdownMs(value);
  const at = capturedAt ? Date.parse(capturedAt) : NaN;
  return left === undefined || Number.isNaN(at) ? undefined : new Date(at + left).toISOString();
}
/** The kind of time-limited deal its own words name; nothing when they name none. */
export function dealKind(words: string): Promotion['kind'] {
  if (/lightning/i.test(words)) return 'lightning';
  if (/deal of the day/i.test(words)) return 'deal_of_the_day';
  if (/limited[-\s]?time/i.test(words)) return 'limited_time';
  return undefined;
}
export function promotion(
  type: Promotion['type'],
  value: unknown,
  evidence: string,
  extra: {
    code?: unknown;
    effectiveMinor?: number;
    validUntil?: unknown;
    validUntilEstimated?: boolean;
    claimedPercent?: number;
  } = {},
): Promotion | undefined {
  const words = text(value);
  if (
    !words ||
    words.length > 200 ||
    !/[a-z]{2}/i.test(words) ||
    /^[{[]|^\w+\s*:\s*\S+$/.test(words)
  )
    return;
  const code = text(extra.code);
  const until = text(extra.validUntil);
  const instant =
    until && /(?:Z|[+-]\d{2}:?\d{2})$/.test(until) && !Number.isNaN(Date.parse(until))
      ? new Date(until).toISOString()
      : undefined;
  return {
    type,
    text: words,
    ...(code ? { code } : {}),
    ...(extra.effectiveMinor !== undefined && extra.effectiveMinor > 0
      ? { effectiveMinor: extra.effectiveMinor }
      : {}),
    ...(instant ? { validUntil: instant } : {}),
    ...(instant && extra.validUntilEstimated ? { validUntilEstimated: true as const } : {}),
    ...(type === 'deal' && dealKind(words) ? { kind: dealKind(words) } : {}),
    ...(extra.claimedPercent !== undefined &&
    extra.claimedPercent >= 0 &&
    extra.claimedPercent <= 100
      ? { claimedPercent: extra.claimedPercent }
      : {}),
    evidence,
  };
}

const number = (value: unknown): number | undefined => {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\s*\d+(?:[.,]\d+)?\s*$/.test(value)
        ? Number(value.trim().replace(',', '.'))
        : undefined;
  return n !== undefined && Number.isFinite(n) ? n : undefined;
};
const count = (value: unknown): number | undefined => {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\s*\d{1,3}(?:[,.\s]?\d{3})*\s*$/.test(value)
        ? Number(value.replace(/[,.\s]/g, ''))
        : undefined;
  return n !== undefined && Number.isSafeInteger(n) && n >= 0 ? n : undefined;
};

/**
 * A published average rating, validated: the value lies within 0…scale and a stated count is a whole number. A
 * rating with zero ratings, or any value that does not check out, is no rating.
 */
export function rating(
  input: { value: unknown; scale?: unknown; count?: unknown },
  evidence: string,
): ProductRating | undefined {
  const value = number(input.value);
  const scale = input.scale == null ? 5 : number(input.scale);
  const total = input.count == null ? undefined : count(input.count);
  if (value === undefined || scale === undefined || scale <= 0 || scale > 100) return;
  if (value < 0 || value > scale) return;
  if (input.count != null && total === undefined) return;
  if (total === 0) return;
  return {
    value: Math.round(value * 100) / 100,
    scale,
    ...(total !== undefined ? { count: total } : {}),
    evidence,
  };
}
/** schema.org AggregateRating (ratingValue, bestRating, ratingCount or reviewCount). */
export function aggregateRating(value: unknown, evidence: string): ProductRating | undefined {
  const node = record(Array.isArray(value) ? value[0] : value);
  if (node.ratingValue == null) return;
  return rating(
    {
      value: node.ratingValue,
      scale: node.bestRating,
      count: node.ratingCount ?? node.reviewCount,
    },
    evidence,
  );
}
/** "4.5 out of 5 stars" and "1,234 ratings" as page text. */
export function textRating(
  stars: string | undefined,
  total: string | undefined,
  evidence: string,
): ProductRating | undefined {
  const match = stars && /(\d+(?:[.,]\d+)?)\s+out of\s+(\d+(?:[.,]\d+)?)/i.exec(stars);
  if (!match) return;
  const counted = total && /^\s*([\d,.\s]+?)\s+(?:global\s+)?(?:ratings?|reviews?)\b/i.exec(total);
  return rating(
    { value: match[1], scale: match[2], count: counted ? counted[1] : undefined },
    evidence,
  );
}

/** Shopify's name for a product without options. */
const DEFAULT_TITLE = /^default title$/i;
/** The selected options as one variant; options without a value, or a lone default, are no variant. */
export function variant(
  options: { name?: unknown; value?: unknown }[],
  evidence: string,
  id?: unknown,
): ProductVariant | undefined {
  const seen = new Set<string>();
  const chosen: VariantOption[] = options.flatMap((option) => {
    const name = text(option.name)?.replace(/:$/, '');
    const value = text(option.value);
    if (!name || !value || DEFAULT_TITLE.test(value) || seen.has(name.toLowerCase())) return [];
    seen.add(name.toLowerCase());
    return [{ name, value }];
  });
  if (!chosen.length) return;
  const identifier = typeof id === 'number' ? String(id) : text(id);
  return {
    ...(identifier ? { id: identifier } : {}),
    label: chosen.map((option) => option.value).join(' · '),
    options: chosen,
    evidence,
  };
}

// Product URLs are identities shared with the API, which looks up older rows by the same rule.
export { identityUrl } from '@morydeals/capture-contracts';

function canonical(product: Product): Product {
  const offers = product.offers.map((offer) => {
    const { availability: raw, promotions: shown, ...rest } = offer;
    const availability = schemaAvailability(raw);
    // The same deal read from two places on the page is one deal.
    const promotions = [...new Map((shown ?? []).map((p) => [`${p.type}\n${p.text}`, p])).values()];
    return {
      ...rest,
      ...(offer.url ? { url: identityUrl(offer.url) } : {}),
      ...(availability ? { availability } : {}),
      ...(promotions.length ? { promotions } : {}),
    };
  });
  // The first offer is the product's primary price: a new (or unstated) offer when there is one, so a used or
  // renewed price never stands in for the new one. Order is otherwise kept (a parser lists the featured first).
  // A subscription price is never the primary.
  const primary = offers.findIndex(
    (offer) =>
      (!offer.condition || offer.condition === 'new') && offer.purchaseType !== 'subscription',
  );
  if (primary > 0) offers.unshift(...offers.splice(primary, 1));
  return { ...product, url: identityUrl(product.url), offers };
}
/**
 * Every parser's products, ready to store: URLs reduced to their identity (variant-selecting parameters kept) and
 * stock states in the AVAILABILITY names.
 */
export function canonicalProducts(result: ParseResult): ParseResult {
  if (!result.products.length) return result;
  const products = result.products.map(canonical);
  if (new Set(products.map((product) => product.url)).size !== products.length)
    return {
      ...result,
      status: 'needs_review',
      products: [],
      issues: [...result.issues, 'Products share one identity URL'],
    };
  return { ...result, products };
}
