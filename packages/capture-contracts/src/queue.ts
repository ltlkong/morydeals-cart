export const QUEUE_NAME = "morydeals-product-capture";
export const CAPTURE_JOB = "capture-product";

/** Third-party price history. The API owns the schedule; the worker only runs what is queued. */
export const HISTORY_QUEUE = "morydeals-history";
/** One Keepa backfill run per interval (its token budget is spent per run). */
export const KEEPA_BACKFILL_SCHEDULER = "keepa-backfill";
export const KEEPA_BACKFILL_EVERY_MS = 60_000;

import { hash } from "node:crypto";
import type { CrawlTask } from "./task.ts";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
/** Both CLI and API producers use the same normalized task identity and retention. */
export function captureJobOptions(task: CrawlTask, attempts = 1) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5)
    throw new Error("Attempts must be between 1 and 5");
  return {
    jobId: task.taskId,
    deduplication: {
      id: hash(
        "sha256",
        JSON.stringify(
          canonical({
            url: new URL(task.url).href,
            context: task.context,
            snapshot: task.snapshot,
            intent: task.intent,
            attempts,
          }),
        ),
      ),
    },
    attempts,
    ...(attempts > 1
      ? { backoff: { type: "exponential" as const, delay: 5000 } }
      : {}),
    removeOnComplete: { age: 7 * 86400, count: 10000 },
    removeOnFail: { age: 30 * 86400, count: 10000 },
  };
}
