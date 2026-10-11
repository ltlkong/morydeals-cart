import { z } from "zod";
import { PricePointSchema } from "../../catalog/schema/price-point.schema.ts";
import { CrawlTaskSchema } from "@morydeals/capture-contracts";

export const CreateProductSchema = z
  .object({ url: z.string().trim().pipe(CrawlTaskSchema.shape.url) })
  .strict();
export const RequestIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const ProductSchema = z.object({
  url: CrawlTaskSchema.shape.url,
  title: z.string().min(1),
  images: z.array(z.string().url()),
  brand: z.string().optional(),
  offers: z
    .array(
      z.object({
        amountMinor: z.number().int().positive().safe(),
        compareAtAmountMinor: z.number().int().positive().safe().optional(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        availability: z.string().optional(),
        seller: z.string().optional(),
      }),
    )
    .length(1),
});
// Parsing strips internal evidence and audit metadata at the response boundary.
export const ParsedCaptureSchema = z.object({
  status: z.literal("parsed"),
  parsed: z.object({ products: z.array(ProductSchema).length(1) }),
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
