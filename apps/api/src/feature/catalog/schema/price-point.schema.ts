import { z } from "zod";

/** One price at a moment; null is a gap (no offer, e.g. no Buy Box). Shared by every product view. */
export const PricePointSchema = z.object({
  at: z.string(),
  amountMinor: z.number().int().positive().safe().nullable(),
});
