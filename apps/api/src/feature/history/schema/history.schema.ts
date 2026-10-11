import { z } from "zod";
import { ProductDataShape } from "../../catalog/schema/catalog.schema.ts";

export const ViewedSchema = z.object({
  items: z.array(z.object({ ...ProductDataShape, viewedAt: z.string() })),
});
export type Viewed = z.infer<typeof ViewedSchema>;
