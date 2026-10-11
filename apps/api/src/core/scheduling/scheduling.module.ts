import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { QueueModule } from "../queue/queue.module.ts";
import { StorageModule } from "../storage/storage.module.ts";
import { JobSchedules } from "./job-schedules.service.ts";

/** The API's recurring jobs (see JobSchedules). */
@Module({
  imports: [ScheduleModule.forRoot(), QueueModule, StorageModule],
  providers: [JobSchedules],
})
export class SchedulingModule {}
