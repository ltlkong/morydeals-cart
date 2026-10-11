import type { CrawlContext } from '@morydeals/capture-contracts';
import type { CapturedPage } from '../acquisition/acquisition.types.ts';
import type { Retailer } from '../parsing/parsers/retailers/routing.ts';

export interface WorkflowDecision {
  version: 1;
  policyVersion: '1.0.0';
  mode: 'auto';
  platform: Retailer | 'shopify' | 'unknown';
  evidence: string[];
  issues: string[];
  workflow: CrawlContext;
  replayOf?: string;
}
export interface DecidedWorkflow {
  context: CrawlContext;
  decision?: WorkflowDecision;
  /** Internal same-task evidence, never accepted from a queue payload. */
  page?: CapturedPage;
}
