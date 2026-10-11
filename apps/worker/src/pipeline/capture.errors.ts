import type { TimingSnapshot } from './capture-timings.ts';
export class CaptureConflictError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    /** When the conflicting lease expires and the task may run again. */
    readonly retryAt?: Date,
  ) {
    super(message);
  }
}
export class CaptureLeaseError extends Error {}

export class PageCaptureError extends Error {
  constructor(
    cause: unknown,
    readonly auditId: string,
    readonly timings?: TimingSnapshot,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}
