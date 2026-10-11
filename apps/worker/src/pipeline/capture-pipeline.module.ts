import { Module, type DynamicModule } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.ts';
import { type AcquisitionModuleOptions } from '../acquisition/acquisition.module.ts';
import { CapturePipelineService } from './capture-pipeline.service.ts';
import { CaptureWorkflowModule } from './capture-workflow.module.ts';

@Module({})
export class CapturePipelineModule {
  static register(acquisition: AcquisitionModuleOptions = {}): DynamicModule {
    return {
      module: CapturePipelineModule,
      imports: [DatabaseModule, CaptureWorkflowModule.register(acquisition)],
      providers: [CapturePipelineService],
      exports: [CapturePipelineService],
    };
  }
}
