import { Module } from '@nestjs/common';
import { WorkerConfigModule } from '../config/config.module.ts';
import { workerConfig, type Configuration } from '../config/worker.config.ts';
import { PAGE_CLASSIFIER } from './page-classifier.ts';
import { MARKDOWN_LIMIT, PageTypeService } from './page-type.service.ts';
import { JevProvider } from './providers/jev.provider.ts';

/** Page-type classification; the provider is chosen by deployment configuration (PAGE_CLASSIFIER). */
@Module({
  imports: [WorkerConfigModule],
  providers: [
    {
      provide: PAGE_CLASSIFIER,
      inject: [workerConfig.KEY],
      useFactory: (config: Configuration) => {
        switch (config.pageClassifier.provider) {
          case 'jev':
            return new JevProvider(config.pageClassifier.typesafeApiKey);
        }
      },
    },
    {
      provide: MARKDOWN_LIMIT,
      inject: [workerConfig.KEY],
      useFactory: (config: Configuration) => config.pageClassifier.markdownLimit,
    },
    PageTypeService,
  ],
  exports: [PageTypeService],
})
export class ClassificationModule {}
