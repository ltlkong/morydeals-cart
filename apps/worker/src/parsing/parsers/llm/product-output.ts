import { z } from 'zod';
import type { PageDocument, ParseResult, Offer } from '../types.ts';
import { PARSER_VERSION } from '../parser.ts';

import { displayedMinorUnits } from '../money.ts';
import { quotedCurrency, resolveCurrency } from '../currency.ts';
import { currentPriceEvidence, struckInSource } from './price-evidence.ts';
import { shareImages } from './share-images.ts';
import { parseShopifyProduct } from '../shopify/index.ts';

const minorAmount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const quotedPrice = z
  .object({
    amountMinor: minorAmount,
    priceText: z.string().min(1).max(100),
    evidence: z.string().min(1).max(1000),
  })
  .strict();
const text = z.string().min(1).max(2000);
export const LlmProductOutputSchema = z
  .object({
    product: z
      .object({
        title: text,
        brand: text.nullable(),
        sku: text.nullable(),
        images: z.array(z.string().max(4096)).max(10),
        offers: z
          .array(
            z
              .object({
                amountMinor: minorAmount,
                compareAt: quotedPrice.nullable(),
                currency: z.string().regex(/^[A-Z]{3}$/),
                priceText: z.string().min(1).max(100),
                evidence: z.string().min(1).max(1000),
              })
              .strict(),
          )
          .max(10),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const llmProductJsonSchema = z.toJSONSchema(LlmProductOutputSchema);

export function normalizeLlmProduct(
  output: string,
  document: PageDocument,
  provider: string,
): ParseResult {
  const base = { parserVersion: PARSER_VERSION, strategy: `llm:${provider}` };
  let data: z.infer<typeof LlmProductOutputSchema>;
  try {
    data = LlmProductOutputSchema.parse(JSON.parse(output));
  } catch {
    return {
      ...base,
      status: 'needs_review',
      products: [],
      issues: ['Invalid LLM product output'],
    };
  }
  if (!data.product)
    return {
      ...base,
      status: 'needs_review',
      products: [],
      issues: ['No product identified'],
    };
  const product = data.product;
  const selected = document.embeddedProducts?.length ? parseShopifyProduct(document) : undefined;
  if (selected && selected.status !== 'parsed') return { ...selected, ...base };
  const variant = selected?.products[0];
  const source = document.markdown;
  if (!source.includes(product.title) && product.title !== variant?.title)
    return {
      ...base,
      status: 'needs_review',
      products: [],
      issues: ['Product title is not supported by the source'],
    };
  const issues: string[] = [];
  const offers: Offer[] = product.offers.flatMap((offer) => {
    if (
      variant &&
      (variant.offers[0].amountMinor !== offer.amountMinor ||
        variant.offers[0].currency !== offer.currency ||
        variant.offers[0].compareAtAmountMinor !== (offer.compareAt?.amountMinor ?? undefined))
    ) {
      issues.push('LLM price does not match the selected variant snapshot');
      return [];
    }
    const declaredCurrency = quotedCurrency(offer.evidence);
    const resolvedCurrency = resolveCurrency(declaredCurrency, offer.evidence, document.url);
    const matches = (quote: { amountMinor: number; priceText: string; evidence: string }) =>
      source.includes(quote.evidence) &&
      quote.evidence.includes(quote.priceText) &&
      displayedMinorUnits(quote.priceText, offer.currency) === quote.amountMinor;
    // Verify quote and integer conversion independently of model output.
    if (
      declaredCurrency === null ||
      !matches(offer) ||
      !resolvedCurrency ||
      resolvedCurrency.currency !== offer.currency
    ) {
      issues.push('Price or currency lacks matching source evidence');
      return [];
    }
    // A former price or installment must not become a second current offer.
    const currentEvidence = currentPriceEvidence(source, offer);
    if (!currentEvidence) {
      issues.push('Former price or installment cannot be a current offer');
      return [];
    }
    let compareAt: Pick<Offer, 'compareAtAmountMinor' | 'compareAtEvidence'> = {};
    if (offer.compareAt) {
      const formerCurrency = quotedCurrency(offer.compareAt.evidence);
      if (
        (!/\b(was|original|regular|list|rrp|msrp)\b|~~|原价/i.test(offer.compareAt.evidence) &&
          !struckInSource(source, offer.compareAt)) ||
        formerCurrency === null ||
        !matches(offer.compareAt) ||
        offer.compareAt.amountMinor <= offer.amountMinor ||
        (formerCurrency && formerCurrency !== offer.currency)
      ) {
        issues.push(
          'Strikethrough price lacks matching source evidence or is not greater than current price',
        );
      } else {
        compareAt = {
          compareAtAmountMinor: offer.compareAt.amountMinor,
          compareAtEvidence: offer.compareAt.evidence,
        };
      }
    }
    return [
      {
        amountMinor: offer.amountMinor,
        ...compareAt,
        currency: offer.currency,
        currencyEvidence: resolvedCurrency.evidence,
        url: document.url,
        evidence: currentEvidence,
      },
    ];
  });
  // A product has one current price; several distinct ones (bundle parts, other sellers) cannot be told apart.
  const distinct = offers.filter(
    (offer, index) =>
      offers.findIndex(
        (other) =>
          other.amountMinor === offer.amountMinor &&
          other.currency === offer.currency &&
          other.compareAtAmountMinor === offer.compareAtAmountMinor,
      ) === index,
  );
  offers.splice(0, offers.length, ...distinct);
  if (offers.length > 1) issues.push('Several different current prices');
  if (!offers.length) issues.push('No verified concrete price');
  const shared = new Set(shareImages(document));
  const images = product.images.filter((value) => {
    try {
      const url = new URL(value);
      return (
        (source.includes(value) || shared.has(value)) &&
        ['https:', 'http:'].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  });
  return {
    ...base,
    status: offers.length && !issues.length ? 'parsed' : 'needs_review',
    issues,
    products: [
      {
        url: document.url,
        title: product.title,
        ...(product.brand && source.includes(product.brand) ? { brand: product.brand } : {}),
        ...(product.sku && source.includes(product.sku) ? { sku: product.sku } : {}),
        images,
        offers,
        evidence: 'page.md',
        ...(variant
          ? {
              url: variant.url,
              title: variant.title,
              sku: variant.sku,
              variantId: variant.variantId,
              images: variant.images,
              evidence: variant.evidence,
              offers: offers.map((offer) => ({
                ...offer,
                url: variant.url,
                availability: variant.offers[0].availability,
              })),
            }
          : {}),
      },
    ],
  };
}
