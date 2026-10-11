import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkerConfigModule } from '../../config/config.module.ts';
import { workerConfig, type Configuration } from '../../config/worker.config.ts';
import { QUEUE_NAME } from '@morydeals/capture-contracts';
import { connectionOptions } from './redis-options.ts';
import { CaptureQueueService } from './capture-queue.service.ts';

@Module({
  imports: [
    WorkerConfigModule,
    BullModule.forRootAsync({
      inject: [workerConfig.KEY],
      useFactory: (config: Configuration) => ({
        connection: connectionOptions(config.redisUrl),
        prefix: config.queuePrefix,
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_NAME }),
  ],
  providers: [CaptureQueueService],
  exports: [BullModule, CaptureQueueService],
})
export class CaptureQueueModule {}
