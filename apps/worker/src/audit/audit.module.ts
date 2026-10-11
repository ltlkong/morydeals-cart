import { Module } from '@nestjs/common';
import { WorkerConfigModule } from '../config/config.module.ts';
import { ArchiveService } from './archive.service.ts';
import { AuditReplayService } from './audit-replay.service.ts';

@Module({
  imports: [WorkerConfigModule],
  providers: [ArchiveService, AuditReplayService],
  exports: [ArchiveService, AuditReplayService],
})
export class AuditModule {}
