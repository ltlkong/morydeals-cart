import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConsoleLogger } from '@nestjs/common';
import { WorkerModule } from './worker.module.ts';
import { CaptureProcessor } from './entrypoints/queue/capture.processor.ts';
import { QUEUE_NAME } from '@morydeals/capture-contracts';

const logger = new ConsoleLogger({ json: true });
const app = await NestFactory.createApplicationContext(WorkerModule, { logger });
app.enableShutdownHooks();
const worker = app.get(CaptureProcessor).worker;
await worker.waitUntilReady();
logger.log({ event: 'worker_started', queue: QUEUE_NAME, concurrency: worker.concurrency });
