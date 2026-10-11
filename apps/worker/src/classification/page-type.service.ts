import { Inject, Injectable } from '@nestjs/common';
import { PAGE_TYPES, type PageClassification, type PageType } from '@morydeals/capture-contracts';
import { convertHtml } from '../parsing/document/html-to-markdown.ts';
import { retailerForUrl } from '../parsing/parsers/index.ts';
import { PAGE_CLASSIFIER, type PageClassifierProvider } from './page-classifier.ts';

export const MARKDOWN_LIMIT = Symbol('PAGE_CLASSIFIER_MARKDOWN_LIMIT');
const isProduct = (value: unknown): boolean => {
  const node = value as Record<string, unknown> | null;
  return !!node && String(node['@type']).includes('Product') && !!node.offers;
};
const certainProduct = (): PageClassification => ({
  source: 'rules',
  probabilities: Object.fromEntries(
    PAGE_TYPES.map((type) => [type, type === 'product' ? 1 : 0]),
  ) as Record<PageType, number>,
  productProbability: 1,
  readiness: 'ready',
});

/**
 * Page type as a probability over every type. Rules decide what is certain (a known store's product URL, or exactly
 * one priced schema.org Product); everything else goes to the configured classifier on cleaned, bounded markdown.
 */
@Injectable()
export class PageTypeService {
  constructor(
    @Inject(PAGE_CLASSIFIER) private readonly classifier: PageClassifierProvider,
    @Inject(MARKDOWN_LIMIT) private readonly markdownLimit: number,
  ) {}
  async classify(url: string, html: string): Promise<PageClassification> {
    if (retailerForUrl(url)) return certainProduct();
    const { document } = convertHtml(html, url, new Date().toISOString());
    const products = document.jsonLd.flatMap((entry) => {
      const graph = (entry as { '@graph'?: unknown[] } | null)?.['@graph'];
      return (Array.isArray(entry) ? entry : Array.isArray(graph) ? graph : [entry]).filter(
        isProduct,
      );
    });
    if (products.length === 1) return certainProduct();
    const { pageTypes: estimated, readiness } = await this.classifier.classify({
      url,
      markdown: document.markdown.slice(0, this.markdownLimit),
    });
    const probabilities = Object.fromEntries(
      PAGE_TYPES.map((type) => [type, estimated[type] ?? 0]),
    ) as Record<PageType, number>;
    if (Object.values(probabilities).some((p) => !Number.isFinite(p) || p < 0 || p > 1))
      throw new Error(`Classifier ${this.classifier.id} returned invalid probabilities`);
    return {
      source: 'model',
      provider: this.classifier.id,
      probabilities,
      productProbability: probabilities.product,
      readiness,
    };
  }
}
