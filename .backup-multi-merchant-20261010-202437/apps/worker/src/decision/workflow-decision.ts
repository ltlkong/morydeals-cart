import type { CrawlContext } from '@morydeals/capture-contracts';
import type { CapturedPage } from '../acquisition/acquisition.types.ts';

export interface WorkflowDecision {
  version: 1;
  policyVersion: '1.0.0';
  mode: 'auto';
  platform: 'amazon-ca' | 'bestbuy-ca' | 'newegg-ca' | 'walmart-ca' | 'shopify' | 'unknown';
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
