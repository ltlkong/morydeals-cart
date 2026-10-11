import { z } from "zod";
export const MerchantSchema = z.object({
  id: z.string(),
  name: z.string(),
  homeUrl: z.url(),
  logoUrl: z.url().nullable(),
  domains: z.array(z.string()),
});
export const MerchantsResponseSchema = z.object({
  merchants: z.array(MerchantSchema),
  allowOthers: z.boolean(),
  /** Whether the app may upload the page it shows (PAGE_UPLOADS); otherwise it sends links only. */
  pageUploads: z.boolean(),
});

export const MerchantLogoUploadSchema = z
  .object({
    contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    sizeBytes: z.number().int().positive().safe(),
  })
  .strict();

export const MerchantLogoUploadResponseSchema = z.object({
  merchantId: z.string(),
  object: z.object({
    id: z.uuid(),
    contentType: z.string(),
    sizeBytes: z.number().int().positive().safe(),
  }),
  upload: z.object({
    url: z.url(),
    method: z.literal("PUT"),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.iso.datetime(),
  }),
});

export const CompleteMerchantLogoSchema = z
  .object({ objectId: z.uuid() })
  .strict();

export const MerchantLogoSchema = z.object({
  merchantId: z.string(),
  logoObjectId: z.uuid(),
  logoUrl: z.url(),
});

export type MerchantLogoUpload = z.infer<typeof MerchantLogoUploadSchema>;
export type CompleteMerchantLogo = z.infer<typeof CompleteMerchantLogoSchema>;
