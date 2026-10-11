import { TerminusModule } from "@nestjs/terminus";
import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { HISTORY_QUEUE, QUEUE_NAME } from "@morydeals/capture-contracts";
import { apiConfig, type ApiConfig } from "../config/schema/config.schema.ts";
import { QueueHealthService } from "./services/queue-health.service.ts";
@Module({
  imports: [
    TerminusModule,
    BullModule.forRootAsync({
      inject: [apiConfig.KEY],
      useFactory: (config: ApiConfig) => {
        const url = new URL(config.redisUrl);
        return {
          prefix: config.queuePrefix,
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            username: decodeURIComponent(url.username) || undefined,
            password: decodeURIComponent(url.password) || undefined,
            db: Number(url.pathname.slice(1) || 0),
            tls: url.protocol === "rediss:" ? {} : undefined,
            maxRetriesPerRequest: 1,
            connectTimeout: 3000,
            commandTimeout: 5000,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: QUEUE_NAME }),
    BullModule.registerQueue({ name: HISTORY_QUEUE }),
  ],
  providers: [QueueHealthService],
  exports: [BullModule, QueueHealthService],
})
export class QueueModule {}
