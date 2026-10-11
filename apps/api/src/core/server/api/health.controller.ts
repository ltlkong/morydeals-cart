import { Controller, Get, Inject } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
import { QueueHealthService } from "../../queue/services/queue-health.service.ts";
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    @Inject(QueueHealthService) private readonly queue: QueueHealthService,
    @Inject(HealthCheckService) private readonly health: HealthCheckService,
  ) {}
  @Get("live") live() {
    return { status: "ok" };
  }
  @Get("ready")
  @HealthCheck()
  ready() {
    return this.health.check([() => this.queue.check()]);
  }
}
