import { Inject, Injectable } from '@nestjs/common';
import { ArchiveService } from './archive.service.ts';
import { readArchive, type Archive } from './raw-archive.ts';
import { readAuditBundle } from './audit-bundle.ts';
import {
  CrawlContextSchema,
  type CrawlTask,
  type CrawlContext,
} from '@morydeals/capture-contracts';
import type { WorkflowDecision } from '../decision/workflow-decision.ts';

@Injectable()
export class AuditReplayService {
  constructor(@Inject(ArchiveService) private readonly archives: ArchiveService) {}

  async restore(task: CrawlTask, archive: Archive, auditId: string) {
    const path = this.archives.path(auditId);
    const original = await readArchive(path, auditId);
    if (original.raw.requestedUrl !== task.url) throw new Error('Replay URL does not match audit');
    const { file: _file, sha256: _hash, bytes: _bytes, ...info } = original.capture;
    const capture = await archive.capture(original.body, info);
    archive.raw.selectedCapture = 0;
    await archive.artifact(
      'replay.json',
      JSON.stringify({ sourceAuditId: auditId, sourceTaskId: original.raw.taskId }, null, 2),
    );
    let context: CrawlContext;
    let decision: WorkflowDecision | undefined;
    if ('decision' in task.context) {
      const files = await readAuditBundle(path, auditId);
      const saved = files.get('decision.json');
      if (!saved) throw new Error('Automatic replay requires a recorded decision');
      context = CrawlContextSchema.parse(JSON.parse(files.get('context.json')!.toString()));
      decision = { ...JSON.parse(saved.toString()), workflow: context, replayOf: auditId };
      await archive.artifact('decision.json', JSON.stringify(decision, null, 2));
    } else context = task.context;
    await archive.artifact('context.json', JSON.stringify(context, null, 2));
    return { page: { body: original.body, capture }, context, decision };
  }
}
