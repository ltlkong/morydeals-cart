import { SnapshotReferenceSchema } from "./snapshot.ts";
import { z } from "zod";
import { ShopifyStoreSchema } from "./shopify.ts";

const selector = z.string().trim().min(1).max(1000);
const duration = z.number().int().min(100).max(120000);
const readiness = z
  .object({
    product: z.boolean().optional(),
    selector: selector.optional(),
    text: z.string().min(1).max(2000).optional(),
    minTextLength: z.number().int().min(1).max(100000).optional(),
  })
  .strict();
const deterministicAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), selector }).strict(),
  z
    .object({ type: z.literal("fill"), selector, value: z.string().max(2000) })
    .strict(),
  z
    .object({
      type: z.literal("select"),
      selector,
      value: z.string().max(2000),
    })
    .strict(),
  z.object({ type: z.literal("waitFor"), selector }).strict(),
]);
const aiAction = z
  .object({
    type: z.literal("act"),
    instruction: z.string().trim().min(1).max(4000),
  })
  .strict();
// Deployment registry decides which identifiers exist; this schema stays portable.
export const BrowserProviderIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,63}$/);
const common = {
  timeoutMs: duration.default(20000),
  waitFor: readiness.optional(),
  network: z
    .object({
      proxyProfile: BrowserProviderIdSchema,
      rotation: z.enum(["session", "per-request"]).default("session"),
    })
    .strict()
    .optional(),
};
/** A store's own public product API, read over plain HTTP. */
const ApiStepSchema = z.discriminatedUnion("provider", [
  z
    .object({
      mode: z.literal("api"),
      provider: z.literal("shopify"),
      store: ShopifyStoreSchema,
      variantId: z
        .string()
        .regex(/^[1-9]\d*$/)
        .optional(),
      timeoutMs: common.timeoutMs,
      network: common.network,
    })
    .strict(),
  // Home Depot Canada prices by store: the page, then that store's localized price and stock for its product.
  z
    .object({
      mode: z.literal("api"),
      provider: z.literal("homedepot-ca"),
      store: z.string().regex(/^\d{4}$/),
      timeoutMs: common.timeoutMs,
      network: common.network,
    })
    .strict(),
  z
    .object({
      mode: z.literal("api"),
      provider: z.literal("target-com"),
      timeoutMs: common.timeoutMs,
      network: common.network,
    })
    .strict(),
]);
export const AcquisitionStepSchema = z.discriminatedUnion("mode", [
  ApiStepSchema,
  z.object({ mode: z.literal("http"), ...common }).strict(),
  z
    .object({
      mode: z.literal("browser"),
      browser: BrowserProviderIdSchema,
      blockResources: z
        .array(z.enum(["image", "media", "font"]))
        .max(3)
        .default(["image", "media", "font"]),
      actions: z.array(deterministicAction).max(10).default([]),
      ...common,
    })
    .strict(),
  z
    .object({
      mode: z.literal("interactive"),
      browser: BrowserProviderIdSchema,
      blockResources: z
        .array(z.enum(["image", "media", "font"]))
        .max(3)
        .default(["image", "media", "font"]),
      model: z.string().trim().min(1).max(200),
      actions: z
        .array(z.union([deterministicAction, aiAction]))
        .min(1)
        .max(10),
      ...common,
    })
    .strict(),
]);
export const AcquisitionReasonSchema = z.enum([
  "incomplete",
  "timeout",
  "network_error",
  "http_error",
  "blocked",
  "interaction_failed",
  "unsupported_content",
  "limit_exceeded",
  "unsupported_browser",
  "unsupported_capability",
]);
export const LlmStrategySchema = z
  .object({
    strategy: z.literal("llm"),
    provider: BrowserProviderIdSchema,
    model: z.string().min(1).max(200).optional(),
    timeoutMs: duration.default(120000),
  })
  .strict();
export const CrawlContextSchema = z
  .object({
    version: z.literal(1),
    locale: z.string().min(2).max(50).optional(),
    market: z.string().min(2).max(50).optional(),
    budgetMs: duration.default(60000),
    acquisition: AcquisitionStepSchema,
    parsing: z
      .discriminatedUnion("strategy", [
        z.object({ strategy: z.literal("structured") }).strict(),
        z.object({ strategy: z.literal("shopify") }).strict(),
        z.object({ strategy: z.literal("amazon-ca") }).strict(),
        z.object({ strategy: z.literal("amazon") }).strict(),
        z.object({ strategy: z.literal("bestbuy-ca") }).strict(),
        z.object({ strategy: z.literal("newegg-ca") }).strict(),
        z.object({ strategy: z.literal("walmart-ca") }).strict(),
        z.object({ strategy: z.literal("ctc-ca") }).strict(),
        z.object({ strategy: z.literal("homedepot-ca") }).strict(),
        z.object({ strategy: z.literal("target-com") }).strict(),
        LlmStrategySchema,
        z
          .object({
            strategy: z.literal("generic"),
            llm: LlmStrategySchema.optional(),
          })
          .strict(),
      ])
      .optional(),
    fallback: z
      .array(
        z
          .object({
            on: z.array(AcquisitionReasonSchema).min(1).max(8),
            acquisition: AcquisitionStepSchema,
          })
          .strict(),
      )
      .max(3)
      .default([]),
    cleaning: z
      .object({
        removeSelectors: z.array(selector).max(30).default([]),
        scope: z.enum(["auto", "full"]).default("auto"),
      })
      .strict()
      .default({ removeSelectors: [], scope: "auto" }),
    audit: z
      .object({ screenshots: z.boolean().default(true) })
      .strict()
      .default({ screenshots: true }),
  })
  .strict()
  .superRefine((context, ctx) => {
    const steps = [
      context.acquisition,
      ...context.fallback.map((f) => f.acquisition),
    ];
    for (const step of steps)
      if (
        step.mode === "api" &&
        context.parsing?.strategy !==
          (step.provider === "shopify"
            ? "shopify"
            : step.provider === "target-com"
              ? "target-com"
              : "homedepot-ca")
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["parsing"],
          message:
            step.provider === "shopify"
              ? "Shopify API acquisition requires the Shopify parser"
              : step.provider === "target-com"
                ? "Target API acquisition requires the Target parser"
                : "Home Depot API acquisition requires the Home Depot parser",
        });
        return;
      }
  });
/** Automatic intent and executable context are separate contracts. */
export const AutoContextSchema = z
  .object({
    version: z.literal(1),
    decision: z
      .object({
        mode: z.literal("auto"),
        browser: BrowserProviderIdSchema.default("camoufox"),
        probeTimeoutMs: duration.default(10000),
        llm: LlmStrategySchema.optional(),
      })
      .strict(),
    locale: z.string().min(2).max(50).optional(),
    market: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    currency: ShopifyStoreSchema.shape.currency.optional(),
    budgetMs: duration.default(60000),
    network: common.network,
    cleaning: CrawlContextSchema.shape.cleaning,
    audit: CrawlContextSchema.shape.audit,
  })
  .strict();
export const TaskContextSchema = z.union([
  CrawlContextSchema,
  AutoContextSchema,
]);
export type AutoContext = z.infer<typeof AutoContextSchema>;
export type TaskContext = z.infer<typeof TaskContextSchema>;
export type LlmStrategy = z.infer<typeof LlmStrategySchema>;
export const CrawlTaskSchema = z
  .object({
    snapshot: SnapshotReferenceSchema.optional(),
    taskId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    url: z
      .string()
      .max(4096)
      .url()
      .refine((value) => {
        if (!URL.canParse(value)) return false;
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password
        );
      }, "Only HTTP(S) URLs without credentials are supported"),
    context: TaskContextSchema.default(() =>
      AutoContextSchema.parse({ version: 1, decision: { mode: "auto" } }),
    ),
    /**
     * capture: the shopper asked for this page. browse: an automatic visit, kept only if it is a product page. A browse
     * visit with a snapshot classifies the uploaded page; without one (page uploads paused) the worker fetches the
     * page itself and keeps it only when its store's parser confirms a product.
     */
    intent: z.enum(["capture", "browse"]).default("capture"),
  })
  .strict();

export type AcquisitionStep = z.infer<typeof AcquisitionStepSchema>;
export type AcquisitionReason = z.infer<typeof AcquisitionReasonSchema>;
export type CrawlContext = z.infer<typeof CrawlContextSchema>;
export type CrawlContextInput = z.input<typeof CrawlContextSchema>;
export type CrawlTask = z.infer<typeof CrawlTaskSchema>;
export type CrawlTaskInput = z.input<typeof CrawlTaskSchema>;
export function validateTask(value: unknown): CrawlTask {
  return CrawlTaskSchema.parse(value);
}
