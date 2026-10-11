import { Inject, Injectable } from '@nestjs/common';
import type { CrawlTask, SkippedVisit } from '@morydeals/capture-contracts';
import { workerConfig, type Configuration } from '../config/worker.config.ts';
import { CapturePipelineService } from '../pipeline/capture-pipeline.service.ts';
import { loadPageSnapshot, removePageSnapshot } from '../pipeline/page-snapshot.ts';
import { PageTypeService } from './page-type.service.ts';

/**
 * An automatic visit: classify the uploaded page first. Only a likely product page (P(product) at the threshold) that
 * is ready to capture runs the full capture. Any other page is dropped with its classification, leaving no archive of
 * what was browsed; a product page that is not ready says why, so the app can wait for the shopper's choice.
 */
@Injectable()
export class PageVisitService {
  constructor(
    @Inject(PageTypeService) private readonly pageTypes: PageTypeService,
    @Inject(CapturePipelineService) private readonly capture: CapturePipelineService,
    @Inject(workerConfig.KEY) private readonly config: Configuration,
  ) {}
  async run(task: CrawlTask) {
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
}
