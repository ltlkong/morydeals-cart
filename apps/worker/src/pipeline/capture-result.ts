import { z } from 'zod';
import type { TimingSnapshot } from './capture-timings.ts';
import type { ParseResult } from '../parsing/parsers/index.ts';
import type { AcquisitionResult } from '../acquisition/acquisition.types.ts';

export interface CaptureResult {
  taskId: string;
  attemptId: string;
  shopifyTarget?: import('../parsing/parsers/index.ts').ShopifyTarget;
  status: ParseResult['status'];
  auditId: string;
  parsed: ParseResult;
  acquisition?: AcquisitionResult;
  decision?: import('../decision/workflow-decision.ts').WorkflowDecision;
  timings?: TimingSnapshot;
}

const storedResult = z
  .object({
    taskId: z.string(),
    attemptId: z.string(),
    auditId: z.string(),
    status: z.enum(['parsed', 'needs_review']),
    parsed: z
      .object({
        products: z.array(
          z
            .object({
              offers: z.array(
                z
                  .object({
                    amountMinor: z.number().int().nonnegative(),
                    compareAtAmountMinor: z.number().int().nonnegative().optional(),
                    currency: z.string().regex(/^[A-Z]{3}$/),
                  })
                  .passthrough(),
              ),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();
export function readCaptureResult(json: string): CaptureResult {
  return storedResult.parse(JSON.parse(json)) as unknown as CaptureResult;
}
