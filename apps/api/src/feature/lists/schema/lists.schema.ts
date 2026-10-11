import { z } from "zod";
import {
  ProductDataShape,
  ProductUrlInputSchema,
} from "../../catalog/schema/catalog.schema.ts";

export const MAX_LISTS = 20;
export const MAX_LIST_ITEMS = 200;
const ListName = z.string().trim().min(1).max(60);

export const ListNameSchema = z.object({ name: ListName }).strict();
/** A new list, optionally created with its first product (saving from a product page). */
export const CreateListSchema = z
  .object({ name: ListName, url: ProductUrlInputSchema.shape.url.optional() })
  .strict();
/** `url`: also report whether each list holds that product (the save-to-list picker). */
export const ListsQuerySchema = z
  .object({ url: ProductUrlInputSchema.shape.url.optional() })
  .strict();
export const ListItemInputSchema = ProductUrlInputSchema;

export const ListsSchema = z.object({
  lists: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      itemCount: z.number().int().nonnegative(),
      /** The newest products' main images, up to four, for the cover mosaic. */
      covers: z.array(z.string()).max(4),
      updatedAt: z.string(),
      contains: z.boolean().optional(),
    }),
  ),
});
export const CreatedListSchema = z.object({ id: z.string() });
export const ListDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Newest first. */
  items: z.array(z.object({ ...ProductDataShape, addedAt: z.string() })),
});
export type ListName = z.infer<typeof ListNameSchema>;
export type CreateList = z.infer<typeof CreateListSchema>;
export type ListsQuery = z.infer<typeof ListsQuerySchema>;
export type Lists = z.infer<typeof ListsSchema>;
export type ListDetail = z.infer<typeof ListDetailSchema>;
