import { workerConfig, configuration, type Configuration } from '../config/worker.config.ts';
import { readPageSnapshot } from './page-snapshot.ts';
import { AuditReplayService } from '../audit/audit-replay.service.ts';
import { DocumentPreparationService } from '../parsing/document/document-preparation.service.ts';
import { CaptureTimings } from './capture-timings.ts';
import { WorkflowDecisionService } from '../decision/workflow-decision.service.ts';
import type { WorkflowDecision } from '../decision/workflow-decision.ts';
import { type CrawlContext } from '@morydeals/capture-contracts';
import { Inject, Injectable } from '@nestjs/common';
import { AcquisitionRunner } from '../acquisition/acquisition.runner.ts';
import { ArchiveService } from '../audit/archive.service.ts';
import type { Archive } from '../audit/raw-archive.ts';
import { readAuditBundle } from '../audit/audit-bundle.ts';
import { validateTask, type CrawlTask } from '@morydeals/capture-contracts';
import type { CapturedPage, AcquisitionResult } from '../acquisition/acquisition.types.ts';

@Injectable()
export class CaptureWorkflowService {
  constructor(
    @Inject(AcquisitionRunner) private readonly engine: AcquisitionRunner,
    @Inject(ArchiveService) private readonly archives: ArchiveService,
    @Inject(WorkflowDecisionService)
    private readonly decisions: WorkflowDecisionService,
    @Inject(DocumentPreparationService) private readonly documents: DocumentPreparationService,
    @Inject(AuditReplayService) private readonly replays: AuditReplayService,
    @Inject(workerConfig.KEY) private readonly config: Configuration = configuration(),
  ) {}
  archive(task: CrawlTask, attemptId: string) {
    return this.archives.create(task.taskId, attemptId, task.url);
  }
  async readAudit(auditId: string) {
    return readAuditBundle(this.archives.path(auditId), auditId);
  }
  async capture(
    task: CrawlTask,
    archive: Archive,
    replayId?: string,
    timings = new CaptureTimings(),
  ) {
    task = validateTask(task);

    await archive.initialize();
    let page: CapturedPage;
    let acquisition: AcquisitionResult | undefined;
    let context: CrawlContext;
    let decision: WorkflowDecision | undefined;
    await archive.artifact('request-context.json', JSON.stringify(task.context, null, 2));
    if (replayId) {
      const replay = await timings.measure('replayRead', () =>
        this.replays.restore(task, archive, replayId),
      );
      ({ page, context, decision } = replay);
    } else if (task.snapshot) {
      ({ page, context } = await timings.measure('acquisition', () =>
        readPageSnapshot(task, archive, this.config),
      ));
    } else {
      const planned = await timings.measure('decision', () =>
        this.decisions.decide(task.url, task.context, archive),
      );
      context = planned.context;
      decision = planned.decision;
      if (decision) await archive.artifact('decision.json', JSON.stringify(decision, null, 2));
      const fetched = await timings.measure('acquisition', () =>
        this.engine.fetch(task.url, archive, context, { page: planned.page }),
      );
      page = fetched;
      acquisition = fetched.acquisition;
    }
    await archive.seal();

    const document = await timings.measure('conversion', () =>
      this.documents.prepare(page, archive, context),
    );
    return { archive, page, acquisition, document, context, decision };
  }
}
