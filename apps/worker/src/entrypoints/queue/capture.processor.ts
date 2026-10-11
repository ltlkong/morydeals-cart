import { Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { DelayedError, UnrecoverableError, type Job } from 'bullmq';
import { ZodError } from 'zod';
import { CapturePipelineService } from '../../pipeline/capture-pipeline.service.ts';
import { CaptureConflictError } from '../../pipeline/capture.errors.ts';
import { CaptureFailureSchema, validateTask } from '@morydeals/capture-contracts';
import { AcquisitionError } from '../../acquisition/acquisition.types.ts';
import { PageCaptureError } from '../../pipeline/capture.errors.ts';
import { RejectedUrlError } from '../../acquisition/network/url-policy.ts';
import { ResponseError } from '../../acquisition/http/http.transport.ts';
import { workerConfig, type Configuration } from '../../config/worker.config.ts';
import { CAPTURE_JOB, QUEUE_NAME } from '@morydeals/capture-contracts';
import { removePageSnapshot } from '../../pipeline/page-snapshot.ts';
import { PageVisitService } from '../../classification/page-visit.service.ts';

@Processor(QUEUE_NAME)
export class CaptureProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(CaptureProcessor.name);
  constructor(
    @Inject(CapturePipelineService) private readonly capture: CapturePipelineService,
    @Inject(PageVisitService) private readonly visits: PageVisitService,
    @Inject(workerConfig.KEY) private readonly config: Configuration,
  ) {
    super();
  }
  onApplicationBootstrap() {
    this.worker.concurrency = this.config.concurrency;
  }
  async process(job: Job, token?: string) {
    try {
      if (job.name !== CAPTURE_JOB) throw new CaptureConflictError('Unsupported job name');
      const task = validateTask(job.data);
      return await (task.intent === 'browse' ? this.visits.run(task) : this.capture.run(task));
    } catch (error) {
      // A stalled job redelivered while the crashed attempt's lease is still live waits for
      // that lease instead of spending (or exhausting) its retry attempts.
      if (error instanceof CaptureConflictError && error.retryAt) {
        await job.moveToDelayed(error.retryAt.getTime() + 1000, token);
        throw new DelayedError();
      }
      const cause = error instanceof PageCaptureError ? error.cause : error;
      const failure = CaptureFailureSchema.safeParse({
        failureCode: cause instanceof AcquisitionError ? cause.reason : 'capture_failed',
      });
      await job
        .updateProgress(failure.success ? failure.data : { failureCode: 'capture_failed' })
        .catch(() => this.logger.warn('Could not publish capture failure code'));
      const unrecoverable =
        cause instanceof ZodError ||
        cause instanceof RejectedUrlError ||
        (cause instanceof CaptureConflictError && !cause.retryable) ||
        (cause instanceof AcquisitionError && !cause.retryable) ||
        (cause instanceof ResponseError && !cause.retryable);
      // Staged WebView snapshots are kept only while BullMQ may still retry the job.
      if (unrecoverable || job.attemptsMade + 1 >= (job.opts.attempts ?? 1))
        await this.discardSnapshot(job);
      if (unrecoverable) throw new UnrecoverableError((cause as Error).message);
      throw error;
    }
  }
  private async discardSnapshot(job: Job) {
    try {
      await removePageSnapshot(validateTask(job.data), this.config);
    } catch {
      this.logger.warn('Snapshot staging cleanup failed');
    }
  }
  @OnWorkerEvent('failed')
  failed(job: Job | undefined, error: Error) {
    this.logger.error({
      event: 'capture_failed',
      taskId: job?.data?.taskId,
      jobId: job?.id,
      message: error.message,
    });
  }
  @OnWorkerEvent('error')
  error(error: Error) {
    this.logger.error({ event: 'worker_error', message: error.message });
  }
}
