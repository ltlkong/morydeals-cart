import { z } from "zod";
/** Safe, transportable reason; raw exception messages stay in the worker audit. */
export const CaptureFailureSchema = z.object({
  failureCode: z.enum([
    "blocked",
    "incomplete",
    "timeout",
    "network_error",
    "capture_failed",
  ]),
});
export type CaptureFailure = z.infer<typeof CaptureFailureSchema>;
