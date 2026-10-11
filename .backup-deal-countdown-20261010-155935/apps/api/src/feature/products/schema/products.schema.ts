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
  type: z.enum(["sale", "coupon", "member", "multi_buy", "deal", "other"]),
  text: z.string().min(1).max(200),
  code: z.string().optional(),
  /** A price the store itself states for this deal; never computed. */
  effectiveMinor: z.number().int().positive().safe().optional(),
  validUntil: z.iso.datetime().optional(),
});
const OfferSchema = z.object({
  amountMinor: z.number().int().positive().safe(),
  compareAtAmountMinor: z.number().int().positive().safe().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** schema.org ItemAvailability name, as stored; `availability` on the product is the normalized value. */
  availability: z.string().optional(),
  condition: ConditionSchema.optional().catch(undefined),
  promotions: z.array(PromotionSchema).optional().catch(undefined),
  seller: z.string().optional(),
});
/** The product as the worker stores it (internal evidence is stripped). */
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
  rating: z
    .object({
      value: z.number().nonnegative(),
      scale: z.number().positive(),
      count: z.number().int().positive().optional(),
    })
    .refine((r) => r.value <= r.scale)
    .optional()
    .catch(undefined),
  /** When this product was last captured (from the product row; absent on a fresh parse). */
  observedAt: z.iso.datetime().optional(),
});
/**
 * The product as the worker stores it (internal evidence is stripped): every offer the page showed, each with
 * its condition; the first is the primary (new when the page has a new offer).
 */
export const ProductDataSchema = ProductFieldsSchema.extend({
  offers: z.array(OfferSchema).min(1),
});
type ProductData = z.infer<typeof ProductDataSchema>;
type Offer = z.infer<typeof OfferSchema>;
type PricePoint = z.infer<typeof PricePointSchema>;
/** The condition a price series is kept under: an offer that states none is read with new. */
export const conditionKey = (condition: string | null | undefined) =>
  condition ?? "new";
const stockOf = (offer: Offer) => {
  const stock = offer.availability?.replace(/^https?:\/\/schema\.org\//, "");
  return (
    (stock &&
      (AVAILABILITY as Record<string, z.infer<typeof AvailabilitySchema>>)[
        stock
      ]) ||
    null
  );
};
/** The cheapest offer of each condition other than the primary's ("Used from $X, Renewed from $Y"). */
export const OtherOfferSchema = z.object({
  condition: ConditionSchema,
  amountMinor: z.number().int().positive().safe(),
  compareAtAmountMinor: z.number().int().positive().safe().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  seller: z.string().optional(),
  availability: AvailabilitySchema.nullable(),
  deals: z.array(PromotionSchema),
  /** How many offers of this condition the page showed. */
  count: z.number().int().positive(),
  /** Up to 90 days of this condition's own prices (lowest per capture); absent when not looked up. */
  history: z.array(PricePointSchema).optional(),
});
/**
 * The shown offer's facts, normalized for the app: availability (null when the store does not say), condition
 * (null when unstated) and the deals still running.
 */
export function productFacts(
  product: ProductData,
  {
    now = Date.now(),
    history,
  }: { now?: number; history?: ReadonlyMap<string, PricePoint[]> } = {},
): Product {
  // The primary offer keeps every existing field's meaning: the new offer when there is one.
  const primary =
    product.offers.find((offer) => conditionKey(offer.condition) === "new") ??
    product.offers[0];
  const running = (offer: Offer) =>
    (offer.promotions ?? []).filter(
      (deal) => !deal.validUntil || Date.parse(deal.validUntil) > now,
    );
  const groups = new Map<z.infer<typeof ConditionSchema>, Offer[]>();
  for (const offer of product.offers) {
    if (
      !offer.condition ||
      conditionKey(offer.condition) === conditionKey(primary.condition)
    )
      continue;
    // Only prices comparable with the primary one (same currency) are offered beside it.
    if (offer.currency !== primary.currency) continue;
    groups.set(offer.condition, [
      ...(groups.get(offer.condition) ?? []),
      offer,
    ]);
  }
  const otherOffers = [...groups].map(([condition, offers]) => {
    const cheapest = offers.reduce((a, b) =>
      b.amountMinor < a.amountMinor ? b : a,
    );
    const series = history?.get(condition);
    return {
      condition,
      amountMinor: cheapest.amountMinor,
      ...(cheapest.compareAtAmountMinor
        ? { compareAtAmountMinor: cheapest.compareAtAmountMinor }
        : {}),
      currency: cheapest.currency,
      ...(cheapest.seller ? { seller: cheapest.seller } : {}),
      availability: stockOf(cheapest),
      deals: running(cheapest),
      count: offers.length,
      ...(series ? { history: series } : {}),
    };
  });
  otherOffers.sort((a, b) => a.amountMinor - b.amountMinor);
  return {
    ...product,
    offers: [primary],
    availability: stockOf(primary),
    condition: primary.condition ?? null,
    deals: running(primary),
    otherOffers,
  };
}
/** The product as the app receives it: stored data plus its normalized shown-offer facts (`productFacts`). */
export const ProductSchema = ProductFieldsSchema.extend({
  /** The primary offer only (one, as before): new when the page has one, else the condition `condition` names. */
  offers: z.array(OfferSchema).length(1),
  availability: AvailabilitySchema.nullable(),
  condition: ConditionSchema.nullable(),
  deals: z.array(PromotionSchema),
  /** The other conditions' offers, cheapest first. */
  otherOffers: z.array(OtherOfferSchema),
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
