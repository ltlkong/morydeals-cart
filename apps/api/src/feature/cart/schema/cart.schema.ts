import { z } from "zod";
import {
  ProductDataShape,
  ProductUrlInputSchema,
  type ProductUrlInput,
} from "../../catalog/schema/catalog.schema.ts";

export const CartItemInputSchema = ProductUrlInputSchema;
export const CartSchema = z.object({
  items: z.array(z.object({ ...ProductDataShape, addedAt: z.string() })),
});
export type CartItemInput = ProductUrlInput;
export type Cart = z.infer<typeof CartSchema>;
