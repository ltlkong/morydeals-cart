import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { Queue } from "bullmq";
import {
  HISTORY_QUEUE,
  KEEPA_BACKFILL_EVERY_MS,
  KEEPA_BACKFILL_SCHEDULER,
} from "@morydeals/capture-contracts";
import { StorageService } from "../storage/services/storage.service.ts";

/**
 * Every recurring job, in one place. The backend owns the schedule; workers only run what is queued.
 * - Keepa backfill: a BullMQ scheduler upserted by a fixed id in Redis, so several API instances keep one
 *   schedule and one run per interval; a worker runs each.
 * - Expired-upload cleanup: hourly in this process, against this API's storage.
 */
@Injectable()
export class JobSchedules implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(HISTORY_QUEUE) private readonly history: Queue,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}
  async onApplicationBootstrap() {
    await this.history.upsertJobScheduler(
      KEEPA_BACKFILL_SCHEDULER,
      { every: KEEPA_BACKFILL_EVERY_MS },
      {
        name: KEEPA_BACKFILL_SCHEDULER,
        opts: { removeOnComplete: 100, removeOnFail: 100 },
      },
    );
  }
  @Cron(CronExpression.EVERY_HOUR, {
    name: "storage.cleanup-expired-uploads",
    waitForCompletion: true,
  })
  sweepExpiredUploads() {
    return this.storage.sweepExpiredUploads();
  }
}
