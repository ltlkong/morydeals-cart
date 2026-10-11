import type { CaptureReadiness, PageType } from '@morydeals/capture-contracts';

/** What a classifier sees: the page URL and its cleaned, length-bounded markdown. */
export type PageClassifierInput = { url: string; markdown: string };

/**
 * A replaceable page-type classifier (TypeSafe Jev today; an embedding classifier can implement the same contract).
 * It returns a probability per page type (types it leaves out count as 0) and whether a product page can be captured
 * as it is.
 */
export interface PageClassifierProvider {
  readonly id: string;
  classify(input: PageClassifierInput): Promise<{
    pageTypes: Partial<Record<PageType, number>>;
    readiness: CaptureReadiness;
  }>;
}
export const PAGE_CLASSIFIER = Symbol('PAGE_CLASSIFIER');
