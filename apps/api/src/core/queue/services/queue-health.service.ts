import { Injectable, Inject } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { HealthIndicatorService } from "@nestjs/terminus";
import type { Queue } from "bullmq";
import { QUEUE_NAME } from "@morydeals/capture-contracts";
@Injectable()
export class QueueHealthService {
  constructor(
    @InjectQueue(QUEUE_NAME) private readonly queue: Queue,
    @Inject(HealthIndicatorService)
    private readonly indicators: HealthIndicatorService,
  ) {}
  async check() {
    const indicator = this.indicators.check("redis");
    try {
      const client = await this.queue.backend.connection.client;
      await client.runCommand("ping", []);
      return indicator.up();
    } catch {
      return indicator.down();
    }
  }
}
