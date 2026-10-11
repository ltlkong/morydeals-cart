import type { PageDocument } from '../parsing/parsers/index.ts';
import type { Capture, Archive } from '../audit/raw-archive.ts';
import type {
  AcquisitionReason,
  AcquisitionStep,
  CrawlContext,
} from '@morydeals/capture-contracts';

export interface CapturedPage {
  body: Buffer;
  capture: Capture;
  html?: string;
}
export interface DriverRequest {
  url: string;
  context: CrawlContext;
  step: AcquisitionStep;
  stepIndex: number;
  archive: Archive;
  signal: AbortSignal;
  prefetchedPage?: CapturedPage;
  artifactPrefix?: string;
}
export interface AcquisitionDriver {
  fetch(request: DriverRequest): Promise<CapturedPage>;
}
export interface AcquisitionAttempt {
  index: number;
  mode: AcquisitionStep['mode'];
  browser?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: 'ready' | 'failed';
  reason?: AcquisitionReason;
  message?: string;
  captureFile?: string;
  reused?: boolean;
}
export interface AcquisitionResult {
  version: 1;
  status: 'ready' | 'incomplete' | 'failed';
  reason?: AcquisitionReason;
  attempts: AcquisitionAttempt[];
  selectedCapture?: number;
  document?: PageDocument;
}
export class AcquisitionError extends Error {
  constructor(
    readonly reason: AcquisitionReason,
    message: string,
    readonly retryable = false,
    readonly result?: AcquisitionResult,
  ) {
    super(message);
  }
}
