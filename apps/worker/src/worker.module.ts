import { Inject, Module, type BeforeApplicationShutdown } from '@nestjs/common';
import { WorkerConfigModule } from './config/config.module.ts';
import { CapturePipelineModule } from './pipeline/capture-pipeline.module.ts';
import { CaptureQueueModule } from './entrypoints/queue/queue.module.ts';
import { CaptureProcessor } from './entrypoints/queue/capture.processor.ts';
import { RedisDomainLimiter } from './entrypoints/queue/redis-domain-limiter.service.ts';
import { HistoryModule } from './history/history.module.ts';
import { ClassificationModule } from './classification/classification.module.ts';
import { PageVisitService } from './classification/page-visit.service.ts';

@Module({
  imports: [
    WorkerConfigModule,
    CaptureQueueModule,
    CapturePipelineModule.register({
      imports: [CaptureQueueModule],
      domainLimiter: RedisDomainLimiter,
    }),
    HistoryModule,
    ClassificationModule,
  ],
  providers: [CaptureProcessor, PageVisitService],
})
export class WorkerModule implements BeforeApplicationShutdown {
  constructor(@Inject(CaptureProcessor) private readonly processor: CaptureProcessor) {}
  async beforeApplicationShutdown() {
    await this.processor.worker.close();
  }
}
