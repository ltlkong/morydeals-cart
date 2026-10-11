import { Module } from '@nestjs/common';
import { WorkerConfigModule } from '../config/config.module.ts';
import { DatabaseModule } from '../database/database.module.ts';
import { CaptureQueueModule } from '../entrypoints/queue/queue.module.ts';
import { HistoryBackfillService } from './history-backfill.service.ts';
import { HistoryProcessor } from './history.processor.ts';
import { KeepaClient } from './keepa.client.ts';

/** Third-party price history (Keepa) for captured products, refreshed by runs the API schedules. */
@Module({
  imports: [WorkerConfigModule, DatabaseModule, CaptureQueueModule],
  providers: [KeepaClient, HistoryBackfillService, HistoryProcessor],
  exports: [HistoryBackfillService],
})
export class HistoryModule {}
