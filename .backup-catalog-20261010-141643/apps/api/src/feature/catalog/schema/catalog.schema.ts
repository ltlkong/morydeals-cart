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
