import { finalizeFailure } from '../../audit/finalize-failure.ts';
import { PageCaptureError } from '../../pipeline/capture.errors.ts';
import { Command, InvalidArgumentError } from 'commander';
import { NestFactory } from '@nestjs/core';
import type { DynamicModule, INestApplicationContext, Type } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CaptureWorkflowModule } from '../../pipeline/capture-workflow.module.ts';
import { CaptureWorkflowService } from '../../pipeline/capture-workflow.service.ts';
import { AcquisitionError } from '../../acquisition/acquisition.types.ts';
import { ArchiveService } from '../../audit/archive.service.ts';
import { readArchive } from '../../audit/raw-archive.ts';
import { readAuditBundle } from '../../audit/audit-bundle.ts';
import { TaskContextSchema, validateTask } from '@morydeals/capture-contracts';
import { inputUrl } from '../../acquisition/network/url-policy.ts';
import { CapturePipelineModule } from '../../pipeline/capture-pipeline.module.ts';
import { CapturePipelineService } from '../../pipeline/capture-pipeline.service.ts';
import { DatabaseModule } from '../../database/database.module.ts';
import { CaptureRepository } from '../../database/capture.repository.ts';
import { CaptureQueueModule } from '../queue/queue.module.ts';
import { CaptureQueueService } from '../queue/capture-queue.service.ts';
import { CaptureTimings } from '../../pipeline/capture-timings.ts';

const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
const workingDirectory = () => process.env.INIT_CWD ?? process.cwd();
async function context(file?: string) {
  if (!file) return undefined;
  return TaskContextSchema.parse(
    JSON.parse(await readFile(resolve(workingDirectory(), file), 'utf8')),
  );
}
async function application<T>(
  module: Type<unknown> | DynamicModule,
  execute: (app: INestApplicationContext) => Promise<T>,
) {
  const app = await NestFactory.createApplicationContext(module, {
    logger: false,
    abortOnError: false,
  });
  app.enableShutdownHooks();
  try {
    return await execute(app);
  } finally {
    await app.close();
  }
}
export function createProgram() {
  const program = new Command()
    .name('morydeals')
    .description('Context-driven product capture worker')
    .showHelpAfterError()
    .exitOverride();
  for (const name of ['fetch', 'capture', 'enqueue'] as const) {
    const command = program
      .command(`${name} <url>`)
      .option('--context <file>', 'Task context JSON; defaults to automatic workflow')
      .option('--id <id>', 'Task identifier');
    if (name === 'enqueue')
      command.option(
        '--attempts <count>',
        'Whole-task retry count',
        (value) => {
          const count = Number(value);
          if (!Number.isInteger(count) || count < 1 || count > 5)
            throw new InvalidArgumentError('Expected an integer between 1 and 5');
          return count;
        },
        1,
      );
    command.action(
      async (url: string, options: { context?: string; id?: string; attempts?: number }) => {
        const task = validateTask({
          taskId: options.id ?? randomUUID(),
          url,
          context: await context(options.context),
        });
        if (name === 'fetch') {
          const result = await application(CaptureWorkflowModule.register(), async (app) => {
            const timings = new CaptureTimings();
            const service = app.get(CaptureWorkflowService);
            const archive = service.archive(task, randomUUID());
            try {
              const captured = await service.capture(task, archive, undefined, timings);
              await archive.artifact(
                'timings.json',
                JSON.stringify(timings.snapshot('before_archive'), null, 2),
              );
              await timings.measure('archive', () => archive.finalize());
              return {
                taskId: task.taskId,
                attemptId: captured.archive.raw.attemptId,
                status: 'ready',
                auditId: archive.id,
                acquisition: captured.acquisition,
                decision: captured.decision,
                timings: timings.snapshot('completed'),
              };
            } catch (error) {
              const failures = await finalizeFailure(archive, error, timings);
              if (failures.length)
                console.error(
                  JSON.stringify({ event: 'audit_finalize_failed', auditId: archive.id, failures }),
                );
              throw new PageCaptureError(error, archive.id, timings.snapshot('failed'));
            }
          });
          print(result);
        } else if (name === 'capture')
          print(
            await application(CapturePipelineModule.register(), (app) =>
              app.get(CapturePipelineService).run(task),
            ),
          );
        else
          print(
            await application(CaptureQueueModule, async (app) => {
              const service = app.get(CaptureQueueService);
              const job = await service.enqueue(task, options.attempts);
              return {
                taskId: job.data.taskId,
                requestedTaskId: task.taskId,
                jobId: job.id,
                queue: service.queue.name,
              };
            }),
          );
      },
    );
  }
  program
    .command('replay <auditId>')
    .option('--context <file>')
    .option('--id <id>')
    .action(async (auditId: string, options: { context?: string; id?: string }) => {
      print(
        await application(CapturePipelineModule.register(), async (app) => {
          const path = app.get(ArchiveService).path(auditId);
          const { raw } = await readArchive(path, auditId);
          const files = await readAuditBundle(path, auditId);
          const task = validateTask({
            taskId: options.id ?? randomUUID(),
            url: raw.requestedUrl,
            context: options.context
              ? await context(options.context)
              : JSON.parse(files.get('request-context.json')!.toString()),
          });
          return app.get(CapturePipelineService).replay(task, auditId);
        }),
      );
    });
  program
    .command('history <url>')
    .action(async (url: string) =>
      print(
        await application(DatabaseModule, (app) =>
          app.get(CaptureRepository).history(inputUrl(url).href),
        ),
      ),
    );
  return program;
}
export function reportCliError(error: unknown) {
  const cause = error instanceof PageCaptureError ? error.cause : error;
  console.error(
    JSON.stringify(
      {
        status: 'failed',
        auditId: error instanceof PageCaptureError ? error.auditId : undefined,
        timings: error instanceof PageCaptureError ? error.timings : undefined,
        reason: cause instanceof AcquisitionError ? cause.reason : undefined,
        acquisition: cause instanceof AcquisitionError ? cause.result : undefined,
        error: cause instanceof Error ? cause.message : String(cause),
      },
      null,
      2,
    ),
  );
}
