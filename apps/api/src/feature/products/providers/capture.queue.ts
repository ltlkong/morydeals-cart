import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import {
  CaptureFailureSchema,
  type CaptureFailure,
  CAPTURE_JOB,
  QUEUE_NAME,
  captureJobOptions,
  validateTask,
  type CrawlTaskInput,
} from "@morydeals/capture-contracts";

export type CaptureState = {
  state: "pending" | "failed" | "completed";
  result?: unknown;
  failureCode?: CaptureFailure["failureCode"];
};
@Injectable()
export class CaptureQueue {
  private readonly logger = new Logger(CaptureQueue.name);
  constructor(@InjectQueue(QUEUE_NAME) private readonly queue: Queue) {}
  private async connected<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      this.logger.error("Capture queue operation failed");
      throw new ServiceUnavailableException(
        "Product service is temporarily unavailable.",
      );
    }
  }
  async submit(input: CrawlTaskInput): Promise<string> {
    const task = validateTask(input);
    return this.connected(async () => {
      const job = await this.queue.add(
        CAPTURE_JOB,
        task,
        captureJobOptions(task),
      );
      if (!job.id) throw new Error("Missing queued job");
      return job.id;
    });
  }
  async find(id: string): Promise<CaptureState | null> {
    return this.connected(async () => {
      const job = await this.queue.getJob(id);
      if (!job) return null;
      const state = await job.getState();
      if (state === "unknown") return null;
      if (state === "failed") {
        const failure = CaptureFailureSchema.safeParse(job.progress);
        return {
          state: "failed",
          failureCode: failure.success ? failure.data.failureCode : undefined,
        };
      }
      if (state === "completed")
        return { state: "completed", result: job.returnvalue };
      return { state: "pending" };
    });
  }
}
