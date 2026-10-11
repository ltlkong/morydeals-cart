import type { LlmMetrics } from '../parsing/parsers/index.ts';

export type CaptureStage =
  | 'databaseStart'
  | 'decision'
  | 'acquisition'
  | 'replayRead'
  | 'conversion'
  | 'parsing'
  | 'archive'
  | 'databaseWrite'
  | 'databaseFailure'
  | 'auditRead';
export interface TimingSnapshot {
  scope: 'before_archive' | 'completed' | 'failed' | 'cached';
  totalMs: number;
  stages: Partial<Record<CaptureStage, { durationMs: number; status: 'completed' | 'failed' }>>;
  /** A breakdown within parsing, not an additional pipeline stage. */
  llm?: LlmMetrics & { requestMs: number };
}
const milliseconds = (value: number) => Math.round(value * 1000) / 1000;

/** Monotonic wall-clock measurements; failed stages retain their elapsed time. */
export class CaptureTimings {
  private readonly started: number;
  private readonly stages: TimingSnapshot['stages'] = {};
  private llm?: TimingSnapshot['llm'];
  constructor(private readonly now = () => performance.now()) {
    this.started = now();
  }
  async measure<T>(stage: CaptureStage, operation: () => T | Promise<T>): Promise<T> {
    const started = this.now();
    let status: 'completed' | 'failed' = 'failed';
    try {
      const result = await operation();
      status = 'completed';
      return result;
    } finally {
      this.stages[stage] = { durationMs: milliseconds(this.now() - started), status };
    }
  }
  async measureLlm<T extends { metrics?: LlmMetrics }>(operation: () => Promise<T>): Promise<T> {
    const started = this.now();
    let metrics: LlmMetrics | undefined;
    try {
      const result = await operation();
      metrics = result.metrics;
      return result;
    } finally {
      this.llm = { ...metrics, requestMs: milliseconds(this.now() - started) };
    }
  }
  snapshot(scope: TimingSnapshot['scope']): TimingSnapshot {
    return {
      scope,
      totalMs: milliseconds(this.now() - this.started),
      stages: structuredClone(this.stages),
      ...(this.llm ? { llm: { ...this.llm } } : {}),
    };
  }
}
