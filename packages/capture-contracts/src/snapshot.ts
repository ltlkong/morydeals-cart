import { z } from "zod";
export const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
export const PageSnapshotSchema = z
  .object({
    url: z
      .url()
      .max(4096)
      .refine((value) => {
        const u = new URL(value);
        return (
          ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
        );
      }),
    html: z.string().min(1).max(MAX_SNAPSHOT_BYTES),
    capturedAt: z.iso.datetime(),
  })
  // Only the page travels; the worker is the single place that parses it.
  .strict();
export type PageSnapshot = z.infer<typeof PageSnapshotSchema>;
export const SnapshotReferenceSchema = z
  .object({ id: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
