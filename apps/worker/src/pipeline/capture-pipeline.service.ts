import { removePageSnapshot } from './page-snapshot.ts';
import { confineToPage } from './product-origin.ts';
import { canonicalProducts } from '../parsing/parsers/index.ts';
import { finalizeFailure } from '../audit/finalize-failure.ts';
import { readCaptureResult } from './capture-result.ts';
import { PageCaptureError } from './capture.errors.ts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CaptureWorkflowService } from './capture-workflow.service.ts';
import { ProductParsingService } from '../parsing/product-parsing.service.ts';
import { validateTask } from '@morydeals/capture-contracts';
import { inputUrl } from '../acquisition/network/url-policy.ts';
import { workerConfig, type Configuration } from '../config/worker.config.ts';
import { CaptureRepository } from '../database/capture.repository.ts';
import type { CaptureResult } from './capture-result.ts';
import { CaptureTimings } from './capture-timings.ts';
import type { CrawlTask } from '@morydeals/capture-contracts';

@Injectable()
export class CapturePipelineService {
  private readonly logger = new Logger(CapturePipelineService.name);
  constructor(
    @Inject(CaptureWorkflowService) private readonly workflow: CaptureWorkflowService,
    @Inject(CaptureRepository) private readonly repository: CaptureRepository,
    @Inject(workerConfig.KEY) private readonly config: Configuration,
    @Inject(ProductParsingService) private readonly parser: ProductParsingService,
  ) {}
  run(task: CrawlTask) {
    return this.execute(task);
  }
  replay(task: CrawlTask, auditId: string) {
    return this.execute(task, auditId);
  }
  private async execute(task: CrawlTask, replayId?: string): Promise<CaptureResult> {
    const timings = new CaptureTimings();
    task = validateTask(task);
    task = { ...task, url: inputUrl(task.url).href };
    const attemptId = randomUUID();
    const archive = this.workflow.archive(task, attemptId);
    const previous = await timings.measure('databaseStart', () =>
      this.repository.start(task.taskId, attemptId, task, archive.id),
    );
    if (previous) {
      const files = await timings.measure('auditRead', () => this.workflow.readAudit(previous));
      const result = readCaptureResult(files.get('result.json')!.toString());
      return { ...result, timings: timings.snapshot('cached') };
    }
    let finalized = false;
    let heartbeat: Promise<void> | undefined;
    let leaseError: unknown;
    const timer = setInterval(
      () => {
        if (!heartbeat)
          heartbeat = this.repository
            .renew(task.taskId, attemptId)
            .catch((error) => {
              leaseError = error;
            })
            .finally(() => {
              heartbeat = undefined;
            });
      },
      Math.floor(this.config.leaseMs / 3),
    );
    timer.unref();
    try {
      const { page, document, acquisition, context, decision } = await this.workflow.capture(
        task,
        archive,
        replayId,
        timings,
      );
      // Products are stored under their identity URL: variant-selecting parameters kept, tracking dropped.
      const parsed = canonicalProducts(
        confineToPage(
          await timings.measure('parsing', () =>
            this.parser.parse(document, context, archive, timings),
          ),
          [task.url, page.capture.url],
        ),
      );
      await archive.artifact('parsed.json', JSON.stringify(parsed, null, 2));
      const result: CaptureResult = {
        taskId: task.taskId,
        attemptId,
        status: parsed.status,
        auditId: archive.id,
        parsed,
        shopifyTarget: parsed.status === 'parsed' ? document.storefront?.target : undefined,
        acquisition,
        decision,
        timings: timings.snapshot('before_archive'),
      };
      await archive.artifact('result.json', JSON.stringify(result, null, 2));
      await archive.artifact(
        'timings.json',
        JSON.stringify(timings.snapshot('before_archive'), null, 2),
      );
      await timings.measure('archive', () => archive.finalize());
      finalized = true;
      clearInterval(timer);
      await heartbeat;
      if (leaseError) throw leaseError;
      await timings.measure('databaseWrite', () =>
        this.repository.complete(result, page.capture.url, page.capture.capturedAt),
      );
      await removePageSnapshot(task, this.config).catch(() =>
        this.logger.warn('Snapshot staging cleanup failed'),
      );
      result.timings = timings.snapshot('completed');
      this.logger.log({
        event: 'capture_completed',
        taskId: task.taskId,
        attemptId,
        status: result.status,
        timings: result.timings,
      });
      return result;
    } catch (error) {
      clearInterval(timer);
      await heartbeat;
      if (!finalized) {
        const failures = await finalizeFailure(archive, error, timings);
        if (failures.length)
          this.logger.error({ event: 'audit_finalize_failed', auditId: archive.id, failures });
      }
      await timings
        .measure('databaseFailure', () =>
          this.repository.fail(
            task.taskId,
            attemptId,
            error instanceof Error ? error.message : String(error),
          ),
        )
        .catch((failure) => {
          this.logger.error({
            event: 'capture_failure_record_failed',
            taskId: task.taskId,
            attemptId,
            message: failure instanceof Error ? failure.message : String(failure),
          });
        });
      const failureTimings = timings.snapshot('failed');
      this.logger.error({
        event: 'capture_failed',
        taskId: task.taskId,
        attemptId,
        auditId: archive.id,
        timings: failureTimings,
      });
      throw new PageCaptureError(error, archive.id, failureTimings);
    } finally {
      clearInterval(timer);
    }
  }
}
