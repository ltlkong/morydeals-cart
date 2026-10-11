import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { HISTORY_QUEUE } from '@morydeals/capture-contracts';
import { HistoryBackfillService } from './history-backfill.service.ts';

/**
 * Runs each queued Keepa backfill. The API schedules the runs (one per minute, see JobSchedules); the worker owns no
 * schedule. Without a Keepa key a run does nothing.
 */
@Processor(HISTORY_QUEUE, { concurrency: 1 })
export class HistoryProcessor extends WorkerHost {
  private readonly logger = new Logger(HistoryProcessor.name);
  constructor(@Inject(HistoryBackfillService) private readonly backfill: HistoryBackfillService) {
    super();
  }
  async process() {
    try {
      return await this.backfill.runOnce();
    } catch (error) {
      // The next scheduled run retries; a failed run must not hold tokens or spam the queue.
      this.logger.warn({
        event: 'keepa_backfill_failed',
        message: error instanceof Error ? error.message : String(error),
      });
      return { fetched: 0, points: 0 };
    }
  }
}
