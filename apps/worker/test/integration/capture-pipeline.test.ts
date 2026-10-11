import { DocumentPreparationService } from '../../src/parsing/document/document-preparation.service.ts';
import { AuditReplayService } from '../../src/audit/audit-replay.service.ts';
import { WorkflowDecisionService } from '../../src/decision/workflow-decision.service.ts';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Queue, QueueEvents } from 'bullmq';
import { PrismaService } from '../../src/database/prisma.service.ts';
import { CaptureRepository } from '../../src/database/capture.repository.ts';
import { CapturePipelineService } from '../../src/pipeline/capture-pipeline.service.ts';
import { CaptureWorkflowService } from '../../src/pipeline/capture-workflow.service.ts';
import { ProductParsingService } from '../../src/parsing/product-parsing.service.ts';
import { LlmProviders } from '../../src/parsing/llm-providers.ts';
import { auditBundlePath } from '../../src/audit/audit-id.ts';
import { readAuditBundle } from '../../src/audit/audit-bundle.ts';
import { ArchiveService } from '../../src/audit/archive.service.ts';
import { WorkerModule } from '../../src/worker.module.ts';
import { CaptureProcessor } from '../../src/entrypoints/queue/capture.processor.ts';
import { CaptureQueueService } from '../../src/entrypoints/queue/capture-queue.service.ts';
import { QUEUE_NAME } from '@morydeals/capture-contracts';
import { LocalDomainLimiter } from '../../src/acquisition/network/domain-limiter.ts';
import { AcquisitionRunner } from '../../src/acquisition/acquisition.runner.ts';
import { HttpDriver } from '../../src/acquisition/http/http.driver.ts';
import { type CrawlContext, type CrawlTask, validateTask } from '@morydeals/capture-contracts';
import { UrlPolicy } from '../../src/acquisition/network/url-policy.ts';
import { connectionOptions } from '../../src/entrypoints/queue/redis-options.ts';
import { RedisDomainLimiter } from '../../src/entrypoints/queue/redis-domain-limiter.service.ts';
import {
  configuration,
  workerConfig,
  projectRoot,
  type Configuration,
} from '../../src/config/worker.config.ts';

const config = configuration();
const schema = `crawler_test_${randomUUID().replaceAll('-', '')}`;
const admin = new PrismaService(config);
let prisma: PrismaService;
let isolated: Configuration;
let engine: AcquisitionRunner;
let repository: CaptureRepository;
let pipeline: CapturePipelineService;
let archiveRoot: string;
let base: string;
let requests = 0;
const html = await readFile(new URL('../fixtures/product.html', import.meta.url), 'utf8');
const server = createServer((req, res) => {
  requests++;
  if (req.url === '/error') {
    res.writeHead(503, { 'content-type': 'text/html' });
    res.end('<h1>Service unavailable</h1>');
  } else if (req.url === '/llm') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      '<h1>Mory Headphones</h1><p>Brand: Mory</p><p>Price: CAD $129.95</p><p>was CAD $199.99</p><p>40 hours battery life.</p>',
    );
  } else if (req.url === '/review') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<h1>Price loading…</h1>');
  } else if (req.url === '/bad-encoding') {
    res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
    res.end('not gzip');
  } else {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  }
});
before(async () => {
  Logger.overrideLogger(false);
  await admin.$connect();
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const db = new URL(config.databaseUrl);
  db.searchParams.set('schema', schema);
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  await promisify(execFile)(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: join(projectRoot, 'apps/worker'),
    env: { ...process.env, DATABASE_URL: db.href },
  });
  isolated = {
    ...config,
    databaseUrl: db.href,
    queuePrefix: `test_${randomUUID().replaceAll('-', '')}`,
  };
  prisma = new PrismaService(isolated);
  await prisma.$connect();
  repository = new CaptureRepository(prisma, isolated);
  archiveRoot = await mkdtemp(join(tmpdir(), 'mory-pipeline-'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const capture = new HttpDriver(new UrlPolicy(true), new LocalDomainLimiter(0), 500000);
  const unsupported = {
    fetch: async () => {
      throw new Error('Unexpected browser fallback');
    },
  };
  engine = new AcquisitionRunner(
    { http: capture, browser: unsupported, interactive: unsupported },
    500000,
  );
  isolated.archiveDir = archiveRoot;
  pipeline = new CapturePipelineService(
    new CaptureWorkflowService(
      engine,
      new ArchiveService(isolated),
      new WorkflowDecisionService(engine),
      new DocumentPreparationService({ maxBytes: 5000000 }),
      new AuditReplayService(new ArchiveService(isolated)),
    ),
    repository,
    isolated,
    new ProductParsingService(new LlmProviders([])),
  );
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
  await rm(archiveRoot, { recursive: true, force: true });
});
const input = (path: string, taskId: string = randomUUID()) =>
  validateTask({
    taskId,
    url: `${base}${path}`,
    context: { version: 1, acquisition: { mode: 'http', timeoutMs: 3000 } },
  }) as CrawlTask & { context: CrawlContext };

test('real HTTP → immutable archive → Markdown → parser → PostgreSQL, idempotent on retry', async () => {
  const taskId = randomUUID();
  const result = await pipeline.run(input('/product', taskId));
  assert.equal(result.status, 'parsed');
  assert.equal(result.parsed.products[0].offers[0].amountMinor, 12995);
  assert.equal(result.timings?.scope, 'completed');
  for (const stage of [
    'databaseStart',
    'acquisition',
    'conversion',
    'parsing',
    'archive',
    'databaseWrite',
  ] as const) {
    assert.equal(result.timings?.stages[stage]?.status, 'completed');
    assert.ok(result.timings!.stages[stage]!.durationMs >= 0);
  }
  assert.ok(
    result.timings!.totalMs >=
      Object.values(result.timings!.stages).reduce((sum, stage) => sum + stage.durationMs, 0) -
        0.01,
  );
  const auditTiming = JSON.parse(
    (await readAuditBundle(auditBundlePath(archiveRoot, result.auditId)))
      .get('timings.json')!
      .toString(),
  );
  assert.equal(auditTiming.scope, 'before_archive');
  assert.equal(auditTiming.stages.archive, undefined);
  assert.equal(auditTiming.stages.databaseWrite, undefined);
  assert.ok(result.acquisition!.attempts[0].durationMs >= 0);
  assert.equal(
    (await readAuditBundle(auditBundlePath(archiveRoot, result.auditId)))
      .get('response-0.body')!
      .toString(),
    html,
  );
  assert.ok(
    (await readAuditBundle(auditBundlePath(archiveRoot, result.auditId)))
      .get('page.md')!
      .toString()
      .includes('40 hours'),
  );
  const requestCount = requests;
  const repeat = await pipeline.run(input('/product', taskId));
  assert.equal(repeat.attemptId, result.attemptId);
  assert.equal(repeat.timings?.scope, 'cached');
  assert.equal(repeat.timings?.stages.acquisition, undefined);
  assert.equal(requests, requestCount);
  const rows = await repository.history(`${base}/product`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amountMinor, 12995);
  assert.equal(rows[0].currency, 'CAD');
  await assert.rejects(pipeline.run(input('/other', taskId)), /another URL/);
  const changed = input('/product', taskId);
  changed.context.locale = 'fr-CA';
  await assert.rejects(pipeline.run(changed), /another context/);
});
test('a new daily run appends history even when price is unchanged', async () => {
  await pipeline.run(input('/product'));
  assert.equal((await repository.history(`${base}/product`)).length, 2);
});
test('replay verifies hashes, makes no network request, preserves original observation time', async () => {
  const original = await pipeline.run(input('/replay'));
  const count = requests;
  const replayTask = input('/replay');
  const replay = await pipeline.replay(replayTask, original.auditId);
  assert.equal(requests, count);
  assert.equal(replay.status, 'parsed');
  assert.ok(replay.timings!.stages.replayRead);
  assert.equal(replay.timings!.stages.acquisition, undefined);
  const rows = await repository.history(`${base}/replay`);
  assert.equal(rows[0].observedAt.toISOString(), rows[1].observedAt.toISOString());
  const zipPath = auditBundlePath(archiveRoot, original.auditId);
  const bytes = await readFile(zipPath);
  await writeFile(zipPath, bytes.subarray(0, 100));
  const tamperedTask = input('/replay');
  await assert.rejects(
    pipeline.replay(tamperedTask, original.auditId),
    /signature|invalid|unexpected|end of central directory/i,
  );
});
test('HTTP failures remain archived and recorded; no product/price fabricated', async () => {
  const taskId = randomUUID();
  await assert.rejects(pipeline.run(input('/error', taskId)), /HTTP 503/);
  const rows = await prisma.captureAttempt.findMany({ where: { taskId } });
  assert.equal(rows[0].status, 'failed');
  assert.ok(
    (await readAuditBundle(auditBundlePath(archiveRoot, rows[0].auditId)))
      .get('response-0.body')!
      .toString()
      .includes('Service unavailable'),
  );
  assert.equal((await repository.history(`${base}/error`)).length, 0);
  await assert.rejects(pipeline.run(input('/error', taskId)), /HTTP 503/);
  assert.equal(await prisma.captureAttempt.count({ where: { taskId } }), 2);
});
test('decoding failures keep raw capture and failure metadata', async () => {
  const taskId = randomUUID();
  await assert.rejects(pipeline.run(input('/bad-encoding', taskId)));
  const rows = await prisma.captureAttempt.findMany({ where: { taskId } });
  assert.equal(
    (await readAuditBundle(auditBundlePath(archiveRoot, rows[0].auditId)))
      .get('response-0.body')!
      .toString(),
    'not gzip',
  );
  assert.ok(
    JSON.parse(
      (await readAuditBundle(auditBundlePath(archiveRoot, rows[0].auditId)))
        .get('failure.json')!
        .toString(),
    ).message,
  );
});
test('unstructured pages are needs_review with no price observations', async () => {
  const result = await pipeline.run(input('/review'));
  assert.equal(result.status, 'needs_review');
  assert.equal(result.parsed.products.length, 0);
  assert.equal((await repository.history(`${base}/review`)).length, 0);
});
test('Nest BullMQ captures explicit-context tasks and rejects permanent bad jobs', async () => {
  const app = await Test.createTestingModule({ imports: [WorkerModule] })
    .overrideProvider(workerConfig.KEY)
    .useValue(isolated)
    .overrideProvider(AcquisitionRunner)
    .useValue(engine)
    .compile();
  await app.init();
  const service = app.get(CaptureQueueService);
  const queue = service.queue;
  const events = new QueueEvents(QUEUE_NAME, {
    connection: connectionOptions(config.redisUrl),
    prefix: isolated.queuePrefix,
  });
  const worker = app.get(CaptureProcessor).worker;
  try {
    await events.waitUntilReady();
    await worker.waitUntilReady();
    assert.equal(worker.concurrency, isolated.concurrency);
    await queue.pause();
    const job = await service.enqueue(input('/queue'));
    const duplicate = await service.enqueue(input('/queue'));
    assert.equal(duplicate.id, job.id);
    assert.equal(duplicate.data.taskId, job.data.taskId);
    const distinct = await service.enqueue({
      ...input('/queue'),
      context: { version: 1, acquisition: { mode: 'http' }, locale: 'fr-CA' },
    });
    assert.notEqual(distinct.id, job.id);
    await distinct.remove();
    await queue.resume();
    const result = await job.waitUntilFinished(events, 15000);
    assert.equal(result.status, 'parsed');
    assert.equal((await repository.history(`${base}/queue`)).length, 1);
    await queue.pause();
    const later = await service.enqueue(input('/queue'));
    assert.notEqual(later.id, job.id, 'Completed tasks do not suppress future price observations');
    await later.remove();
    await queue.resume();
    const bad = await queue.add(
      'capture-product',
      {
        taskId: randomUUID(),
        url: 'file:///etc/passwd',
        context: { version: 1, acquisition: { mode: 'http' } },
      },
      { attempts: 3 },
    );
    await assert.rejects(bad.waitUntilFinished(events, 15000), /HTTP/);
    assert.equal((await queue.getJob(bad.id!))!.attemptsMade, 1);
    await assert.rejects(
      service.enqueue({
        ...input('/queue'),
        taskId: job.id!,
        context: { version: 1, locale: 'fr-CA', acquisition: { mode: 'http' } },
      }),
      /another payload/,
    );
  } finally {
    await worker.close();
    await events.close();
    await queue.obliterate({ force: true });
    await app.close();
  }
});
test('Redis domain limiter reserves spaced slots across workers', async () => {
  const prefix = `limit_${randomUUID().replaceAll('-', '')}`;
  const options = { connection: connectionOptions(config.redisUrl), prefix };
  const qa = new Queue(QUEUE_NAME, options);
  const qb = new Queue(QUEUE_NAME, options);
  const a = new RedisDomainLimiter(qa, { ...isolated, domainIntervalMs: 100 });
  const b = new RedisDomainLimiter(qb, { ...isolated, domainIntervalMs: 100 });
  try {
    const times: number[] = [];
    await Promise.all([
      a.wait('shop.example').then(() => times.push(Date.now())),
      b.wait('shop.example').then(() => times.push(Date.now())),
    ]);
    times.sort();
    assert.ok(times[1] - times[0] >= 75);
  } finally {
    await qa.close();
    await qb.close();
  }
});
test('transactional leases exclude concurrent attempts and recover crashed workers', async () => {
  const taskId = randomUUID();
  const attemptId = randomUUID();
  await repository.start(taskId, attemptId, input('/lock', taskId), join(archiveRoot, 'lease'));
  await assert.rejects(
    repository.start(taskId, randomUUID(), input('/lock', taskId), join(archiveRoot, 'other')),
    /active attempt/,
  );
  await repository.renew(taskId, attemptId);
  await repository.fail(taskId, attemptId, 'released test lease');
  assert.equal((await pipeline.run(input('/lock', taskId))).status, 'parsed');
  const staleId = randomUUID();
  const staleAttempt = randomUUID();
  await repository.start(
    staleId,
    staleAttempt,
    input('/abandoned', staleId),
    join(archiveRoot, 'abandoned'),
  );
  await prisma.captureRun.update({ where: { id: staleId }, data: { leaseExpiresAt: new Date(0) } });
  const result = await pipeline.run(input('/abandoned', staleId));
  assert.equal(result.status, 'parsed');
  const row = await prisma.captureAttempt.findUniqueOrThrow({ where: { id: staleAttempt } });
  assert.equal(row.status, 'failed');
  assert.equal(row.error, 'Previous attempt lease expired');
  await assert.rejects(repository.renew(staleId, staleAttempt), /Lost run lease/);
  await assert.rejects(
    repository.complete(
      { ...result, attemptId: staleAttempt },
      `${base}/abandoned`,
      new Date().toISOString(),
    ),
    /Lost run lease/,
  );
  assert.equal((await repository.history(`${base}/abandoned`)).length, 1);
});
test('persistence failure rolls back the result, product and observations together', async () => {
  const task = input('/rollback');
  const attemptId = randomUUID();
  await repository.start(task.taskId, attemptId, task, join(archiveRoot, 'rollback'));
  const source = await pipeline.run(input('/rollback-source'));
  const invalid = structuredClone(source);
  invalid.taskId = task.taskId;
  invalid.taskId = task.taskId;
  invalid.attemptId = attemptId;
  invalid.parsed.products[0].url = task.url;
  invalid.parsed.products[0].offers[0].currency = 'INVALID';
  await assert.rejects(repository.complete(invalid, task.url, new Date().toISOString()));
  assert.equal(
    (await prisma.captureRun.findUniqueOrThrow({ where: { id: task.taskId } })).status,
    'running',
  );
  assert.equal(await prisma.productObservation.count({ where: { taskId: task.taskId } }), 0);
  assert.equal(await prisma.trackedProduct.count({ where: { url: task.url } }), 0);
  await repository.fail(task.taskId, attemptId, 'rollback verified');
});

test(
  'live Ollama qwen3.5:4b → validated product → ZIP audit → PostgreSQL',
  { skip: process.env.TEST_OLLAMA !== '1', timeout: 150000 },
  async () => {
    const { OllamaProvider } = await import('../../src/parsing/providers/ollama.provider.ts');
    const live = new CapturePipelineService(
      new CaptureWorkflowService(
        engine,
        new ArchiveService(isolated),
        new WorkflowDecisionService(engine),
        new DocumentPreparationService({ maxBytes: 5000000 }),
        new AuditReplayService(new ArchiveService(isolated)),
      ),
      repository,
      isolated,
      new ProductParsingService(new LlmProviders([new OllamaProvider(isolated.ollama.host)])),
    );
    const task = input('/llm');
    task.context.parsing = {
      strategy: 'llm',
      provider: 'ollama',
      model: 'qwen3.5:4b',
      timeoutMs: 120000,
    };
    const result = await live.run(task);
    assert.equal(result.status, 'parsed');
    assert.equal(result.parsed.strategy, 'llm:ollama');
    assert.ok(result.timings!.llm!.requestMs > 0);
    assert.ok(result.timings!.llm!.generationMs! > 0);
    assert.ok(result.timings!.llm!.outputTokens! > 0);
    assert.equal(result.parsed.products[0].offers[0].amountMinor, 12995);
    assert.equal(result.parsed.products[0].offers[0].compareAtAmountMinor, 19999);
    const history = await repository.history(task.url);
    assert.equal(history[0].currency, 'CAD');
    assert.equal(history[0].amountMinor, 12995);
    assert.equal(history[0].compareAtAmountMinor, 19999);
    assert.ok(history[0].compareAtEvidence);
    const files = await readAuditBundle(auditBundlePath(archiveRoot, result.auditId));
    assert.equal(JSON.parse(files.get('llm-response.json')!.toString()).model, 'qwen3.5:4b');
    assert.ok(files.has('llm-request.json') && files.has('page.md') && files.has('parsed.json'));
    const row = await prisma.captureRun.findUniqueOrThrow({ where: { id: task.taskId } });
    assert.equal('result' in row, false);
    assert.equal('context' in row, false);
    const attempt = await prisma.captureAttempt.findUniqueOrThrow({
      where: { id: result.attemptId },
    });
    assert.equal(attempt.auditId, result.auditId);
  },
);

test('LLM malformed output and provider failures preserve one ZIP and never create price observations', async () => {
  const providers = new LlmProviders([
    {
      id: 'malformed',
      generate: async () => ({
        provider: 'malformed',
        model: 'fixture',
        text: 'not json',
        raw: { content: 'not json' },
      }),
    },
    {
      id: 'offline',
      generate: async () => {
        throw new Error('Fixture model unavailable');
      },
    },
  ]);
  const service = new CapturePipelineService(
    new CaptureWorkflowService(
      engine,
      new ArchiveService(isolated),
      new WorkflowDecisionService(engine),
      new DocumentPreparationService({ maxBytes: 5000000 }),
      new AuditReplayService(new ArchiveService(isolated)),
    ),
    repository,
    isolated,
    new ProductParsingService(providers),
  );
  const task = input('/llm-invalid');
  task.context.parsing = { strategy: 'llm', provider: 'malformed', timeoutMs: 1000 };
  const result = await service.run(task);
  assert.equal(result.status, 'needs_review');
  const files = await readAuditBundle(auditBundlePath(archiveRoot, result.auditId));
  assert.equal(JSON.parse(files.get('llm-response.json')!.toString()).text, 'not json');
  assert.equal((await repository.history(task.url)).length, 0);
  const failed = input('/llm-offline');
  failed.context.parsing = { strategy: 'llm', provider: 'offline', timeoutMs: 1000 };
  await assert.rejects(service.run(failed), (error: unknown) => {
    const failure = error as Error & {
      timings: {
        scope: string;
        stages: Record<string, { status: string }>;
        llm: { requestMs: number };
      };
    };
    assert.match(failure.message, /model unavailable/);
    assert.equal(failure.timings.scope, 'failed');
    assert.equal(failure.timings.stages.parsing.status, 'failed');
    assert.equal(failure.timings.stages.databaseFailure.status, 'completed');
    assert.ok(failure.timings.llm.requestMs >= 0);
    return true;
  });
  const attempt = await prisma.captureAttempt.findFirstOrThrow({
    where: { taskId: failed.taskId },
  });
  const failure = await readAuditBundle(auditBundlePath(archiveRoot, attempt.auditId));
  assert.ok(
    failure.has('response-0.body') &&
      failure.has('llm-request.json') &&
      failure.has('failure.json'),
  );
  assert.equal((await repository.history(failed.url)).length, 0);
});

test('stable URL identity survives missing/changing SKU and preserves separate variant URLs', async () => {
  const source = await pipeline.run(input('/identity'));
  const save = async (url: string, sku?: string) => {
    const task = validateTask({ ...input('/identity'), url });
    const attemptId = randomUUID();
    await repository.start(task.taskId, attemptId, task, 'fixture-identity-audit');
    const result = structuredClone(source);
    Object.assign(result, { taskId: task.taskId, attemptId });
    Object.assign(result.parsed.products[0], { url, sku });
    await repository.complete(result, url, new Date().toISOString());
    await assert.rejects(
      repository.complete(result, url, new Date().toISOString()),
      /Lost run lease/,
    );
  };
  await save(`${base}/identity`, undefined);
  await save(`${base}/identity`, 'new-sku');
  assert.equal(await prisma.trackedProduct.count({ where: { url: `${base}/identity` } }), 1);
  const rows = await repository.history(`${base}/identity`);
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map((row) => row.productId)).size, 1);
  await save(`${base}/identity?variant=1`, 'same-sku');
  await save(`${base}/identity?variant=2`, 'same-sku');
  const a = await repository.history(`${base}/identity?variant=1`);
  const b = await repository.history(`${base}/identity?variant=2`);
  assert.notEqual(a[0].productId, b[0].productId);
  const longUrl = `${base}/identity?reference=${'x'.repeat(3000)}`;
  await save(longUrl);
  assert.equal((await repository.history(longUrl)).length, 1);
});

test('retailer fixtures persist one selected listing and rejected identity never writes a price', async () => {
  const cases = [
    ['amazon-ca', 'https://www.amazon.ca/dp/B0FF3549YB', 'amazon-single-B0FF3549YB', 1999],
    [
      'bestbuy-ca',
      'https://www.bestbuy.ca/en-ca/product/19190432',
      'bestbuy-iphone16e-19190432',
      86999,
    ],
    [
      'newegg-ca',
      'https://www.newegg.ca/p/9SIC7XMM4F0269?Item=9SIC7XMM4F0269',
      'newegg-options-marketplace-9SIC7XMM4F0269',
      29311,
    ],
  ] as const;
  for (const [strategy, url, fixture, expected] of cases) {
    const body = await readFile(new URL(`../fixtures/retailers/${fixture}.html`, import.meta.url));
    const reader = new AcquisitionRunner(
      {
        http: {
          fetch: async ({ archive, url: requestedUrl }) => {
            const capture = await archive.capture(body, {
              url: requestedUrl,
              status: 200,
              headers: { 'content-type': 'text/html' },
              capturedAt: new Date().toISOString(),
              truncated: false,
            });
            return { body, capture };
          },
        },
      },
      500000,
    );
    const localPipeline = new CapturePipelineService(
      new CaptureWorkflowService(
        reader,
        new ArchiveService(isolated),
        new WorkflowDecisionService(reader),
        new DocumentPreparationService({ maxBytes: 5000000 }),
        new AuditReplayService(new ArchiveService(isolated)),
      ),
      repository,
      isolated,
      new ProductParsingService(new LlmProviders([])),
    );
    const task = validateTask({
      taskId: randomUUID(),
      url,
      context: { version: 1, acquisition: { mode: 'http' }, parsing: { strategy } },
    });
    const result = await localPipeline.run(task);
    assert.equal(result.status, 'parsed');
    assert.equal(result.parsed.products.length, 1);
    assert.equal(result.parsed.products[0].offers[0].amountMinor, expected);
    assert.equal(await prisma.productObservation.count({ where: { taskId: task.taskId } }), 1);
    const rejected = validateTask({
      ...task,
      taskId: randomUUID(),
      url: url.replace(
        /B0FF3549YB|19190432|9SIC7XMM4F0269/g,
        strategy === 'amazon-ca'
          ? 'B000000001'
          : strategy === 'bestbuy-ca'
            ? '99999999'
            : '9SIC7XMM4F0000',
      ),
    });
    const failure = await localPipeline.run(rejected);
    assert.equal(failure.status, 'needs_review');
    assert.equal(await prisma.productObservation.count({ where: { taskId: rejected.taskId } }), 0);
  }
});

test('independent concurrent captures commit through serializable transaction conflicts', async () => {
  const tasks = Array.from({ length: 4 }, (_, index) => input(`/parallel-${index}`));
  const results = await Promise.all(tasks.map((task) => pipeline.run(task)));
  for (const result of results) {
    assert.equal(result.status, 'parsed');
    assert.equal(await prisma.productObservation.count({ where: { taskId: result.taskId } }), 1);
  }
});

test('URL-only automatic capture reuses its probe, persists the workflow and replays without network', async () => {
  const task = validateTask({ taskId: randomUUID(), url: `${base}/automatic` });
  const beforeRequests = requests;
  const result = await pipeline.run(task);
  assert.equal(result.status, 'parsed');
  assert.equal(result.decision!.platform, 'unknown');
  assert.equal(result.decision!.workflow.parsing!.strategy, 'generic');
  assert.equal(requests - beforeRequests, 1);
  assert.equal(result.acquisition!.attempts[0].reused, true);
  assert.equal(result.timings!.stages.decision!.status, 'completed');
  assert.equal(await prisma.productObservation.count({ where: { taskId: task.taskId } }), 1);
  const files = await readAuditBundle(auditBundlePath(archiveRoot, result.auditId));
  assert.ok(
    files.has('decision.json') &&
      files.has('request-context.json') &&
      files.has('probe-acquisition.json'),
  );
  const replay = await pipeline.replay(
    validateTask({ ...task, taskId: randomUUID() }),
    result.auditId,
  );
  assert.equal(requests - beforeRequests, 1);
  assert.deepEqual(replay.parsed, result.parsed);
  assert.equal(replay.decision!.replayOf, result.auditId);
});
