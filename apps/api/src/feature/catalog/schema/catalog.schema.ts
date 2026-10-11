import { z } from "zod";
import { CrawlTaskSchema } from "@morydeals/capture-contracts";
import { ProductSchema } from "../../products/schema/products.schema.ts";
import { PricePointSchema } from "./price-point.schema.ts";

/** A product, named by its product URL (as the worker stores it). */
export const ProductUrlInputSchema = z
  .object({ url: z.string().trim().pipe(CrawlTaskSchema.shape.url) })
  .strict();
export type ProductUrlInput = z.infer<typeof ProductUrlInputSchema>;
export { PricePointSchema };
/** What every feature shows for a saved product: its latest data and price history. */
export const ProductDataShape = {
  url: z.string(),
  /** The latest confirmed product, or null until the worker has stored it. */
  product: ProductSchema.nullable(),
  /** Up to 90 days of prices, oldest first: Keepa Buy Box history merged with our own captures; null is a gap. */
  history: z.array(PricePointSchema),
};

/** Products a catalog page returns when the caller does not ask for a size, and at most. */
export const CATALOG_PAGE_SIZE = 20;
export const CATALOG_PAGE_MAX = 50;
/**
 * A page of the shared catalog: `cursor` is the previous page's `nextCursor`; `limit` is clamped to 1…50;
 * `merchant` keeps one store's products.
 */
export const CatalogQuerySchema = z
  .object({
    cursor: z.string().max(200).optional(),
    limit: z.coerce
      .number()
      .int()
      .optional()
      .transform((limit) =>
        Math.min(CATALOG_PAGE_MAX, Math.max(1, limit ?? CATALOG_PAGE_SIZE)),
      ),
    merchant: z
      .string()
      .regex(/^[a-z0-9_-]{1,64}$/i)
      .optional(),
  })
  .strict();
export type CatalogQuery = z.infer<typeof CatalogQuerySchema>;
/** Newest observed first; `nextCursor` is null on the last page. */
export const CatalogPageSchema = z.object({
  items: z.array(z.object(ProductDataShape)),
  nextCursor: z.string().nullable(),
});
export type CatalogPage = z.infer<typeof CatalogPageSchema>;
