import { Inject, Injectable } from '@nestjs/common';
import { Archive } from './raw-archive.ts';
import { auditBundlePath } from './audit-id.ts';
import { workerConfig, type Configuration } from '../config/worker.config.ts';

@Injectable()
export class ArchiveService {
  constructor(@Inject(workerConfig.KEY) private readonly config: Configuration) {}
  create(taskId: string, attemptId: string, url: string) {
    return new Archive(this.config.archiveDir, taskId, attemptId, url);
  }
  path(auditId: string) {
    return auditBundlePath(this.config.archiveDir, auditId);
  }
}
