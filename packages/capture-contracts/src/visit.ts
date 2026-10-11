import { z } from "zod";

/** What kind of store page an automatic visit landed on. */
export const PAGE_TYPES = [
  "product",
  "listing",
  "home",
  "cart_or_checkout",
  "account",
  "article",
  "other",
] as const;
export const PageTypeSchema = z.enum(PAGE_TYPES);
export type PageType = z.infer<typeof PageTypeSchema>;

/**
 * Whether a product page can be captured as it is: one product with one definite current price (`ready`), a product
 * still waiting for a size/colour/configuration choice or showing only a "From" or range price (`needs_selection`),
 * or a product page whose name or price has not rendered yet (`not_loaded`).
 */
export const CAPTURE_READINESS = [
  "ready",
  "needs_selection",
  "not_loaded",
] as const;
export const CaptureReadinessSchema = z.enum(CAPTURE_READINESS);
export type CaptureReadiness = z.infer<typeof CaptureReadinessSchema>;

/**
 * A page classification as a probability over every page type (not just a verdict). `source` says whether rules
 * decided it (certain) or a classifier provider estimated it.
 */
export const PageClassificationSchema = z
  .object({
    source: z.enum(["rules", "model"]),
    provider: z.string().max(50).optional(),
    probabilities: z.record(PageTypeSchema, z.number().min(0).max(1)),
    /** P(product), the value automatic capture is decided on. */
    productProbability: z.number().min(0).max(1),
    readiness: CaptureReadinessSchema,
  })
  .strict();
export type PageClassification = z.infer<typeof PageClassificationSchema>;

/**
 * The job result of a browse visit that is not parsed: below the product threshold, or a product page that is not
 * ready to capture. A ready product page returns the capture result instead.
 */
export const SkippedVisitSchema = z
  .object({
    status: z.enum(["not_product", "needs_selection", "not_loaded"]),
    classification: PageClassificationSchema,
  })
  .strict();
export type SkippedVisit = z.infer<typeof SkippedVisitSchema>;
