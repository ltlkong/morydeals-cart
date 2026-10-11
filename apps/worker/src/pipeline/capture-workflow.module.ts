import { Module, type DynamicModule } from '@nestjs/common';
import {
  AcquisitionModule,
  type AcquisitionModuleOptions,
} from '../acquisition/acquisition.module.ts';
import { DecisionModule } from '../decision/decision.module.ts';
import { AuditModule } from '../audit/audit.module.ts';
import { ParsingModule } from '../parsing/parsing.module.ts';
import { CaptureWorkflowService } from './capture-workflow.service.ts';

/** Shared by fetch-only CLI and the persistent capture pipeline. */
@Module({})
export class CaptureWorkflowModule {
  static register(options: AcquisitionModuleOptions = {}): DynamicModule {
    const acquisition = AcquisitionModule.register(options);
    return {
      module: CaptureWorkflowModule,
      imports: [acquisition, DecisionModule.register(acquisition), AuditModule, ParsingModule],
      providers: [CaptureWorkflowService],
      exports: [CaptureWorkflowService, AuditModule, ParsingModule],
    };
  }
}
