import { z } from "zod";
import { PricePointSchema } from "../../catalog/schema/price-point.schema.ts";
import { CrawlTaskSchema } from "@morydeals/capture-contracts";

export const CreateProductSchema = z
  .object({ url: z.string().trim().pipe(CrawlTaskSchema.shape.url) })
  .strict();
export const RequestIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
/** schema.org ItemAvailability names (as the worker stores them) → the app's availability. */
const AVAILABILITY = {
  InStock: "in_stock",
  OutOfStock: "out_of_stock",
  SoldOut: "out_of_stock",
  PreOrder: "preorder",
  PreSale: "preorder",
  BackOrder: "backorder",
  LimitedAvailability: "limited",
  Discontinued: "discontinued",
} as const;
export const AvailabilitySchema = z.enum([
  "in_stock",
  "out_of_stock",
  "preorder",
  "backorder",
  "limited",
  "discontinued",
]);
/** The item's stated condition; renewed covers refurbished, open_box is new but opened. */
export const ConditionSchema = z.enum([
  "new",
  "used",
  "renewed",
  "open_box",
  "damaged",
]);
/** A deal shown beside the price (morydeals-price `promotions[]` vocabulary, plus `deal` for limited-time deals). */
export const PromotionSchema = z.object({
  type: z.enum([
    "sale",
    "coupon",
    "promo_code",
    "member",
    "multi_buy",
    "subscription",
    "credit",
    "deal",
    "other",
  ]),
  text: z.string().min(1).max(200),
  code: z.string().optional(),
  /** A price the store itself states for this deal; never computed. */
  effectiveMinor: z.number().int().positive().safe().optional(),
  /** When the deal ends (UTC); never guessed. */
  validUntil: z.iso.datetime().optional(),
  /** The end was computed from the page's countdown plus the capture time (the offer's `observedAt`). */
  validUntilEstimated: z.boolean().optional().catch(undefined),
  /** The time-limited deal the store names. */
  kind: z
    .enum([
      "lightning",
      "deal_of_the_day",
      "limited_time",
      "prime_day",
      "prime_exclusive",
    ])
    .optional()
    .catch(undefined),
  /** A Lightning Deal's share claimed, as the page states it. */
  claimedPercent: z.number().min(0).max(100).optional().catch(undefined),
  /** The percent off the deal's own words state ("Apply 15% coupon"); never computed. */
  percentOff: z.number().gt(0).lt(100).optional().catch(undefined),
  /** The amount off the deal's own words state ("Save $5 with coupon"), minor units; never computed. */
  amountOffMinor: z
    .number()
    .int()
    .positive()
    .safe()
    .optional()
    .catch(undefined),
  /** The store's own promotion id. */
  promotionId: z.string().optional().catch(undefined),
});
/** Offer facts the page states beside a price, kept as shown. */
const OfferDetailsSchema = z.object({
  /** What the struck price is ("Was", "List Price", "Typical price"). */
  compareAtLabel: z.string().max(60).optional().catch(undefined),
  /** The savings percent stated beside the struck price ("-26%"); never computed. */
  savingsPercent: z.number().int().gt(0).lt(100).optional().catch(undefined),
  /** Who ships it ("Amazon"). */
  shipsFrom: z.string().max(200).optional().catch(undefined),
  /** Units left when the page states a count ("Only 3 left in stock"). */
  stockQuantity: z.number().int().nonnegative().optional().catch(undefined),
  /** A fee stated beside the price ("$0.55 eco fee might apply"). */
  fee: z.string().max(200).optional().catch(undefined),
});
/**
 * How an offer's price is bought: once, as a subscription (Amazon Subscribe & Save), or once at a price only members
 * pay (Amazon Prime member price). Subscription and member prices are their own offers, never the primary.
 */
export const PurchaseTypeSchema = z.enum([
  "one_time",
  "subscription",
  "member",
]);
const PURCHASE_ORDER = ["one_time", "member", "subscription"];
/** One stored offer as the worker keeps it. */
const StoredOfferSchema = z.object({
  amountMinor: z.number().int().positive().safe(),
  compareAtAmountMinor: z.number().int().positive().safe().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** schema.org ItemAvailability name, as stored. */
  availability: z.string().optional(),
  condition: ConditionSchema.optional().catch(undefined),
  promotions: z.array(PromotionSchema).optional().catch(undefined),
  seller: z.string().optional(),
  purchaseType: PurchaseTypeSchema.optional().catch(undefined),
  ...OfferDetailsSchema.shape,
});
/** Product-level facts: what the item is, whoever sells it. */
const ProductFieldsSchema = z.object({
  url: CrawlTaskSchema.shape.url,
  title: z.string().min(1),
  images: z.array(z.string().url()),
  brand: z.string().optional(),
  /** The selected variant, when the store names one ("Black · 256GB"). */
  variant: z
    .object({
      id: z.string().optional(),
      label: z.string().min(1),
      options: z.array(z.object({ name: z.string(), value: z.string() })),
    })
    .optional()
    .catch(undefined),
  /** The product's published rating and review count. */
  rating: z
    .object({
      value: z.number().nonnegative(),
      scale: z.number().positive(),
      count: z.number().int().positive().optional(),
    })
    .refine((r) => r.value <= r.scale)
    .optional()
    .catch(undefined),
  /** Badges the store shows ("Amazon's Choice", "#1 Best Seller"). */
  badges: z.array(z.string().min(1)).optional().catch(undefined),
  /** The store's own sales signal as shown ("100+ bought in past month"). */
  boughtRecently: z.string().optional().catch(undefined),
  /** The store's category path, broadest first. */
  categories: z.array(z.string().min(1)).optional().catch(undefined),
  /** Specifications the page lists, in page order. */
  specifications: z
    .array(z.object({ name: z.string().min(1), value: z.string().min(1) }))
    .optional()
    .catch(undefined),
  /** Offers the page counts without listing them ("Compare New (3) from $699.99"). */
  offerSummary: z
    .object({
      count: z.number().int().nonnegative(),
      condition: ConditionSchema.optional().catch(undefined),
      fromMinor: z.number().int().positive().safe().optional(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .optional(),
      text: z.string().min(1),
    })
    .optional()
    .catch(undefined),
  /** When this product was last captured: the capture time of the offers shown (absent on a fresh parse). */
  observedAt: z.iso.datetime().optional(),
});
/**
 * The product as the worker stores it (internal evidence is stripped): every offer the page showed, each with
 * its condition; the first is the primary (new when the page has a new offer).
 */
export const ProductDataSchema = ProductFieldsSchema.extend({
  offers: z.array(StoredOfferSchema).min(1),
});
type ProductData = z.infer<typeof ProductDataSchema>;
type StoredOffer = z.infer<typeof StoredOfferSchema>;
type PricePoint = z.infer<typeof PricePointSchema>;
type Condition = z.infer<typeof ConditionSchema>;
/** The condition a price series is kept under: an offer that states none is read with new. */
export const conditionKey = (condition: string | null | undefined) =>
  condition ?? "new";
/**
 * The series a featured price is kept under: its condition, or for a subscription or member price its own series (a
 * Subscribe & Save or Prime member price never enters the regular one-time price's history).
 */
export const seriesKey = (
  condition: string | null | undefined,
  purchaseType?: string | null,
) =>
  purchaseType && purchaseType !== "one_time"
    ? `${purchaseType}:${conditionKey(condition)}`
    : conditionKey(condition);
/** An offer's identity across captures: its condition, how it is bought, and its seller. */
export const offerKey = (
  condition: string | null | undefined,
  seller: string | null | undefined,
  purchaseType?: string | null,
) => `${seriesKey(condition, purchaseType)}\n${seller ?? ""}`;
/** A deal's text that is only its countdown ("Ends in 08:17:30") was frozen at capture; it reads as a deal. */
const dealText = (text: string) =>
  /^\s*ends\s+in\s+[\d:hms\s]+$/i.test(text) ? "Deal" : text;
/**
 * A `sale` deal that only restates the offer's struck price ("Was $2,299.99", "List Price $249.99", parser 3.17.0):
 * the price row already shows it with its label and percent, so it is not a deal of its own.
 */
export function restatesCompareAt(
  deal: { type: string; text: string },
  compareAtAmountMinor: number | undefined,
) {
  if (deal.type !== "sale" || !compareAtAmountMinor) return false;
  const stated =
    /^[A-Za-z][A-Za-z ]{1,30}:?\s+\$\s?([\d,]+(?:\.\d{1,2})?)$/.exec(
      deal.text.trim(),
    );
  return (
    !!stated &&
    Math.round(Number(stated[1].replace(/,/g, "")) * 100) ===
      compareAtAmountMinor
  );
}
const stockOf = (offer: StoredOffer) => {
  const stock = offer.availability?.replace(/^https?:\/\/schema\.org\//, "");
  return (
    (stock &&
      (AVAILABILITY as Record<string, z.infer<typeof AvailabilitySchema>>)[
        stock
      ]) ||
    null
  );
};
/**
 * One offer: one price, with its own condition, seller, stock, deals (still running), deal end and price history.
 */
export const ProductOfferSchema = z.object({
  amountMinor: z.number().int().positive().safe(),
  compareAtAmountMinor: z.number().int().positive().safe().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** The stated condition; null when unstated (most stores sell new without saying so). */
  condition: ConditionSchema.nullable(),
  seller: z.string().optional(),
  /** A subscription (Subscribe & Save) or member (Prime) price is its own offer, never the primary. */
  purchaseType: PurchaseTypeSchema,
  availability: AvailabilitySchema.nullable(),
  /** Deals still running at response time; one past its end is never sent. */
  deals: z.array(PromotionSchema),
  /** When the soonest-ending running deal ends; null when no deal shows an end. */
  dealEndsAt: z.iso.datetime().nullable(),
  /** dealEndsAt came from the page's countdown and the capture time (`observedAt`), not from the store. */
  dealEndsEstimated: z.boolean(),
  /** Up to 90 days of this offer's own prices; absent when not looked up. */
  history: z.array(PricePointSchema).optional(),
  ...OfferDetailsSchema.shape,
});
export type ProductOffer = z.infer<typeof ProductOfferSchema>;
/** Price series for one product: per condition (the primary's) and per offer (condition and seller). */
export type OfferHistory = {
  byCondition: ReadonlyMap<string, PricePoint[]>;
  byOffer: ReadonlyMap<string, PricePoint[]>;
};
const CONDITION_ORDER: (Condition | null)[] = [
  "new",
  null,
  "open_box",
  "renewed",
  "used",
  "damaged",
];
/**
 * The product as the app gets it: product facts plus every offer. The first offer is the primary one (new when
 * the store has a new offer; else the one the page features); the rest follow by condition, then price.
 */
export function productFacts(
  product: ProductData,
  { now = Date.now(), history }: { now?: number; history?: OfferHistory } = {},
): Product {
  const once = (offer: StoredOffer) =>
    (offer.purchaseType ?? "one_time") === "one_time";
  const order = (offer: StoredOffer) =>
    PURCHASE_ORDER.indexOf(offer.purchaseType ?? "one_time");
  const primary =
    product.offers.find(
      (offer) => once(offer) && conditionKey(offer.condition) === "new",
    ) ??
    product.offers.find(once) ??
    product.offers[0];
  const rest = product.offers
    .filter((offer) => offer !== primary)
    .sort(
      (a, b) =>
        CONDITION_ORDER.indexOf(a.condition ?? null) -
          CONDITION_ORDER.indexOf(b.condition ?? null) ||
        order(a) - order(b) ||
        a.amountMinor - b.amountMinor,
    );
  const view = (offer: StoredOffer, isPrimary: boolean): ProductOffer => {
    const restated = (offer.promotions ?? []).find((deal) =>
      restatesCompareAt(deal, offer.compareAtAmountMinor),
    );
    const savingsPercent = offer.savingsPercent ?? restated?.percentOff;
    const deals = (offer.promotions ?? [])
      .filter((deal) => !restatesCompareAt(deal, offer.compareAtAmountMinor))
      .filter((deal) => !deal.validUntil || Date.parse(deal.validUntil) > now)
      .map((deal) => ({ ...deal, text: dealText(deal.text) }));
    const ending = deals
      .filter((deal) => deal.validUntil)
      .sort((a, b) => Date.parse(a.validUntil!) - Date.parse(b.validUntil!))[0];
    const series = isPrimary
      ? history?.byCondition.get(seriesKey(offer.condition, offer.purchaseType))
      : history?.byOffer.get(
          offerKey(offer.condition, offer.seller, offer.purchaseType),
        );
    return {
      amountMinor: offer.amountMinor,
      ...(offer.compareAtAmountMinor
        ? { compareAtAmountMinor: offer.compareAtAmountMinor }
        : {}),
      currency: offer.currency,
      condition: offer.condition ?? null,
      ...(offer.seller ? { seller: offer.seller } : {}),
      ...(offer.compareAtLabel ? { compareAtLabel: offer.compareAtLabel } : {}),
      ...(savingsPercent && offer.compareAtAmountMinor
        ? { savingsPercent: Math.round(savingsPercent) }
        : {}),
      ...(offer.shipsFrom ? { shipsFrom: offer.shipsFrom } : {}),
      ...(offer.stockQuantity !== undefined
        ? { stockQuantity: offer.stockQuantity }
        : {}),
      ...(offer.fee ? { fee: offer.fee } : {}),
      purchaseType: offer.purchaseType ?? "one_time",
      availability: stockOf(offer),
      deals,
      dealEndsAt: ending?.validUntil ?? null,
      dealEndsEstimated: !!ending?.validUntilEstimated,
      ...(series ? { history: series } : {}),
    };
  };
  const offers = [view(primary, true), ...rest.map((o) => view(o, false))];
  return {
    ...product,
    offers,
    availability: offers[0].availability,
    condition: offers[0].condition,
    deals: offers[0].deals,
  };
}
/** The product as the app receives it. */
export const ProductSchema = ProductFieldsSchema.extend({
  /** Every offer, the primary first (see productFacts). */
  offers: z.array(ProductOfferSchema).min(1),
  /** @deprecated The primary offer's (offers[0]) stock; kept for older apps. */
  availability: AvailabilitySchema.nullable(),
  /** @deprecated The primary offer's condition; kept for older apps. */
  condition: ConditionSchema.nullable(),
  /** @deprecated The primary offer's running deals; kept for older apps. */
  deals: z.array(PromotionSchema),
});
export type Product = z.infer<typeof ProductSchema>;
// Parsing strips internal evidence and audit metadata at the response boundary.
export const ParsedCaptureSchema = z.object({
  status: z.literal("parsed"),
  parsed: z.object({ products: z.array(ProductDataSchema).length(1) }),
});
export const AcceptedProductSchema = z.object({
  id: RequestIdSchema,
  status: z.literal("pending"),
});
export const ProductStatusSchema = z.discriminatedUnion("status", [
  AcceptedProductSchema,
  z.object({
    id: RequestIdSchema,
    status: z.literal("failed"),
    message: z.string(),
  }),
  z.object({
    id: RequestIdSchema,
    status: z.literal("ready"),
    product: ProductSchema,
  }),
]);
/** A page the in-app browser is about to read, asked about before its snapshot is uploaded. */
export const KnownPageRequestSchema = CreateProductSchema;
/** The product recently captured from that page, or unknown (the app then uploads the page). */
export const KnownPageSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unknown") }),
  z.object({
    status: z.literal("product"),
    product: ProductSchema,
    history: z.array(PricePointSchema),
  }),
]);
export type KnownPage = z.infer<typeof KnownPageSchema>;
export type CreateProduct = z.infer<typeof CreateProductSchema>;
export type ProductStatus = z.infer<typeof ProductStatusSchema>;
/** An automatic page visit: was it a product page (by P(product)), and if so the confirmed product. */
export const VisitStatusSchema = z.discriminatedUnion("status", [
  AcceptedProductSchema,
  z.object({
    id: RequestIdSchema,
    status: z.literal("not_product"),
    productProbability: z.number(),
  }),
  z.object({
    id: RequestIdSchema,
    status: z.literal("product"),
    productProbability: z.number(),
    product: ProductSchema,
    /** Up to 90 days of prices, as the cart and lists show them. */
    history: z.array(PricePointSchema),
  }),
  z.object({
    id: RequestIdSchema,
    status: z.literal("unconfirmed"),
    productProbability: z.number(),
  }),
  /** A product page waiting for a size, colour or configuration choice before it has a definite price. */
  z.object({
    id: RequestIdSchema,
    status: z.literal("needs_selection"),
    productProbability: z.number(),
  }),
  z.object({ id: RequestIdSchema, status: z.literal("failed") }),
]);
export type VisitStatus = z.infer<typeof VisitStatusSchema>;
