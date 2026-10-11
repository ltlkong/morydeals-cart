import { Module, type DynamicModule } from '@nestjs/common';
import { AcquisitionRunner } from '../acquisition/acquisition.runner.ts';
import { WorkerConfigModule } from '../config/config.module.ts';
import { defaultLlmParsing, workerConfig, type Configuration } from '../config/worker.config.ts';
import { WorkflowDecisionService } from './workflow-decision.service.ts';

@Module({})
export class DecisionModule {
  static register(acquisition: DynamicModule): DynamicModule {
    return {
      module: DecisionModule,
      imports: [WorkerConfigModule, acquisition],
      providers: [
        {
          provide: WorkflowDecisionService,
          inject: [AcquisitionRunner, workerConfig.KEY],
          useFactory: (engine: AcquisitionRunner, config: Configuration) =>
            new WorkflowDecisionService(engine, {
              maxBudgetMs: config.maxBudgetMs,
              llm: defaultLlmParsing(config),
            }),
        },
      ],
      exports: [WorkflowDecisionService],
    };
  }
}
