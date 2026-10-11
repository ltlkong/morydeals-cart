import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { validateTask, type CrawlTaskInput } from '@morydeals/capture-contracts';
import { CaptureConflictError } from '../../pipeline/capture.errors.ts';
import { QUEUE_NAME, CAPTURE_JOB, captureJobOptions } from '@morydeals/capture-contracts';

@Injectable()
export class CaptureQueueService {
  constructor(@InjectQueue(QUEUE_NAME) readonly queue: Queue) {}
  async enqueue(input: CrawlTaskInput, attempts = 1) {
    const task = validateTask(input);
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5)
      throw new CaptureConflictError('Attempts must be between 1 and 5');
    const existing = await this.queue.getJob(task.taskId);
    if (existing && JSON.stringify(existing.data) !== JSON.stringify(task))
      throw new CaptureConflictError('Task ID belongs to another payload');
    const added = await this.queue.add(CAPTURE_JOB, task, captureJobOptions(task, attempts));
    const job = await this.queue.getJob(added.id!);
    if (!job) throw new Error('Enqueued job is no longer available');
    return job;
  }
}
