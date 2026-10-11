import { Inject, Injectable } from '@nestjs/common';
import {
  PAGE_TYPES,
  type CrawlTask,
  type PageClassification,
  type SkippedVisit,
} from '@morydeals/capture-contracts';
import { workerConfig, type Configuration } from '../config/worker.config.ts';
import { CapturePipelineService } from '../pipeline/capture-pipeline.service.ts';
import { loadPageSnapshot, removePageSnapshot } from '../pipeline/page-snapshot.ts';
import { PageTypeService } from './page-type.service.ts';

/**
 * An automatic visit: classify the uploaded page first. Only a likely product page (P(product) at the threshold) that
 * is ready to capture runs the full capture. Any other page is dropped with its classification, leaving no archive of
 * what was browsed; a product page that is not ready says why, so the app can wait for the shopper's choice.
 *
 * With page uploads paused (API PAGE_UPLOADS=false) a visit carries only its URL: the worker fetches the desktop page
 * itself and keeps it only when the store's parser confirms one product. Anything else is reported as not a product,
 * so the app does not ask again.
 */
@Injectable()
export class PageVisitService {
  constructor(
    @Inject(PageTypeService) private readonly pageTypes: PageTypeService,
    @Inject(CapturePipelineService) private readonly capture: CapturePipelineService,
    @Inject(workerConfig.KEY) private readonly config: Configuration,
  ) {}
  async run(task: CrawlTask) {
    if (!task.snapshot) return this.fetched(task);
    const snapshot = await loadPageSnapshot(task, this.config);
    const classification = await this.pageTypes.classify(snapshot.url, snapshot.html);
    const { productProbability, readiness } = classification;
    const product = productProbability >= this.config.pageClassifier.productThreshold;
    if (product && readiness === 'ready')
      return { ...(await this.capture.run(task)), classification };
    await removePageSnapshot(task, this.config);
    return {
      status: product && readiness !== 'ready' ? readiness : 'not_product',
      classification,
    } satisfies SkippedVisit;
  }
  private async fetched(task: CrawlTask) {
    const result = (await this.capture.run(task)) as { status?: string };
    const product = result.status === 'parsed';
    const classification: PageClassification = {
      source: 'rules',
      provider: 'store-parser',
      probabilities: Object.fromEntries(
        PAGE_TYPES.map((type) => [type, type === (product ? 'product' : 'other') ? 1 : 0]),
      ) as PageClassification['probabilities'],
      productProbability: product ? 1 : 0,
      readiness: 'ready',
    };
    return product
      ? { ...result, classification }
      : ({ status: 'not_product', classification } satisfies SkippedVisit);
  }
}
