import { DocumentPreparationService } from '../../../../src/parsing/document/document-preparation.service.ts';
import { AuditReplayService } from '../../../../src/audit/audit-replay.service.ts';
import { WorkflowDecisionService } from '../../../../src/decision/workflow-decision.service.ts';
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseShopifyProduct } from '../../../../src/parsing/parsers/index.ts';
import { ShopifyDriver } from '../../../../src/acquisition/shopify/shopify.driver.ts';
import { HttpTransport } from '../../../../src/acquisition/http/http.transport.ts';
import { UrlPolicy } from '../../../../src/acquisition/network/url-policy.ts';
import { LocalDomainLimiter } from '../../../../src/acquisition/network/domain-limiter.ts';
import { AcquisitionRunner } from '../../../../src/acquisition/acquisition.runner.ts';
import { CaptureWorkflowService } from '../../../../src/pipeline/capture-workflow.service.ts';
import { ArchiveService } from '../../../../src/audit/archive.service.ts';
import { configuration } from '../../../../src/config/worker.config.ts';
import { validateTask, CrawlContextSchema } from '@morydeals/capture-contracts';
import { readAuditBundle } from '../../../../src/audit/audit-bundle.ts';

test('Shopify API acquisition archives two raw sources, replays JSON offline and never enumerates variants', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mory-shopify-'));
  const url = 'https://ca.example.com/products/shirt?variant=202';
  const task = validateTask({
    taskId: 'shopify-test',
    url,
    context: {
      version: 1,
      acquisition: {
        mode: 'api',
        provider: 'shopify',
        store: {
          shopDomain: 'example.myshopify.com',
          country: 'CA',
          language: 'EN',
          currency: 'CAD',
        },
      },
      parsing: { strategy: 'shopify' },
    },
  });
  const calls: string[] = [];
  t.mock.method(
    HttpTransport.prototype,
    'fetch',
    async (...args: Parameters<HttpTransport['fetch']>) => {
      const [target, archive, options = {}] = args;
      calls.push(target);
      const json = !!options.json;
      if (json) {
        assert.equal(target, 'https://example.myshopify.com/api/2026-10/graphql.json');
        assert.equal(options.json!.variables.variant, 'gid://shopify/ProductVariant/202');
        assert.doesNotMatch(options.json!.query, /variants\s*\(|pageInfo/);
      }
      const body = Buffer.from(
        json
          ? JSON.stringify({
              extensions: { context: { country: 'CA', language: 'EN' } },
              data: {
                shop: { name: 'Example', primaryDomain: { url: 'https://ca.example.com' } },
                product: {
                  id: 'gid://shopify/Product/10',
                  handle: 'shirt',
                  title: 'Shirt',
                  requiresSellingPlan: false,
                },
                selected: {
                  id: 'gid://shopify/ProductVariant/202',
                  product: { id: 'gid://shopify/Product/10' },
                  title: 'Blue',
                  sku: 'BLUE',
                  availableForSale: true,
                  currentlyNotInStock: false,
                  price: { amount: '19.95', currencyCode: 'CAD' },
                  compareAtPrice: null,
                  image: null,
                },
              },
            })
          : '<script>Shopify.shop = "example.myshopify.com";</script>',
      );
      const capture = await archive.capture(body, {
        ...options.capture,
        url: target,
        status: 200,
        headers: { 'content-type': json ? 'application/json' : 'text/html' },
        capturedAt: '2026-10-09T00:00:00Z',
        truncated: false,
      });
      return { body, capture };
    },
  );
  const engine = new AcquisitionRunner(
    { api: new ShopifyDriver(new UrlPolicy(), new LocalDomainLimiter(0), 100000) },
    100000,
  );
  const archives = new ArchiveService({ ...configuration(), archiveDir: root });
  const acquisition = new CaptureWorkflowService(
    engine,
    archives,
    new WorkflowDecisionService(engine),
    new DocumentPreparationService({ maxBytes: 5000000 }),
    new AuditReplayService(archives),
  );
  try {
    const original = acquisition.archive(task, 'first');
    const captured = await acquisition.capture(task, original);
    const result = parseShopifyProduct(captured.document);
    assert.equal(result.status, 'parsed');
    assert.equal(result.products[0].offers[0].amountMinor, 1995);
    assert.equal(calls.length, 2);
    assert.equal(original.raw.selectedCapture, 1);
    await original.finalize();
    const files = await readAuditBundle(original.bundlePath);
    assert.ok(files.has('response-0.body') && files.has('response-1.body'));
    assert.ok(files.has('shopify-query-0.json'));
    const knownTask = validateTask({
      ...task,
      taskId: 'shopify-known',
      context: {
        ...CrawlContextSchema.parse(task.context),
        acquisition: { ...CrawlContextSchema.parse(task.context).acquisition, variantId: '202' },
      },
    });
    const knownArchive = acquisition.archive(knownTask, 'known');
    const known = await acquisition.capture(knownTask, knownArchive);
    assert.equal(parseShopifyProduct(known.document).status, 'parsed');
    assert.equal(calls.length, 3, 'Known target makes only the API request');
    assert.equal(knownArchive.raw.captures.length, 1);
    assert.equal(knownArchive.raw.captures[0].kind, 'api-response');
    await knownArchive.finalize();
    const conflicting = validateTask({
      ...knownTask,
      taskId: 'shopify-conflict',
      context: {
        ...CrawlContextSchema.parse(knownTask.context),
        acquisition: {
          ...CrawlContextSchema.parse(knownTask.context).acquisition,
          variantId: '203',
        },
      },
    });
    await assert.rejects(
      acquisition.capture(conflicting, acquisition.archive(conflicting, 'conflict')),
      /conflicts with the requested URL/,
    );
    assert.equal(calls.length, 3, 'Conflicting variant is rejected before any request');
    const replayTask = { ...task, taskId: 'shopify-replay' };
    const replay = acquisition.archive(replayTask, 'second');
    const replayed = await acquisition.capture(replayTask, replay, original.id);
    assert.deepEqual(parseShopifyProduct(replayed.document), result);
    assert.equal(calls.length, 3, 'Replay must not call the storefront');
    assert.equal(replayed.document.fetchedAt, '2026-10-09T00:00:00Z');
    await replay.finalize();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('API context requires its parser and rejects unused browser controls', () => {
  const input = {
    version: 1,
    acquisition: {
      mode: 'api',
      provider: 'shopify',
      store: {
        shopDomain: 'example.myshopify.com',
        country: 'CA',
        language: 'EN',
        currency: 'CAD',
      },
    },
  };
  assert.equal(CrawlContextSchema.safeParse(input).success, false);
  assert.equal(
    CrawlContextSchema.safeParse({ ...input, parsing: { strategy: 'shopify' } }).success,
    true,
  );
  assert.equal(
    CrawlContextSchema.safeParse({
      ...input,
      acquisition: { ...input.acquisition, waitFor: { selector: 'h1' } },
      parsing: { strategy: 'shopify' },
    }).success,
    false,
  );
});

test('HTTP 200 GraphQL failures stay archived and trigger only the configured fallback', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mory-shopify-errors-'));
  const url = 'https://ca.example.com/products/shirt?variant=202';
  let payload: unknown;
  let browserCalls = 0;
  t.mock.method(
    HttpTransport.prototype,
    'fetch',
    async (...args: Parameters<HttpTransport['fetch']>) => {
      const [target, archive, options = {}] = args;
      const body = Buffer.from(
        options.json
          ? JSON.stringify(payload)
          : '<script>Shopify.shop="example.myshopify.com";</script>',
      );
      const capture = await archive.capture(body, {
        ...options.capture,
        url: target,
        status: 200,
        headers: { 'content-type': options.json ? 'application/json' : 'text/html' },
        capturedAt: new Date().toISOString(),
        truncated: false,
      });
      return { body, capture };
    },
  );
  const engine = new AcquisitionRunner(
    {
      api: new ShopifyDriver(new UrlPolicy(), new LocalDomainLimiter(0), 100000),
      browser: {
        fetch: async ({ archive }) => {
          browserCalls++;
          const body = Buffer.from('<h1>Product page</h1>');
          const capture = await archive.capture(body, {
            kind: 'rendered-dom',
            url,
            status: 200,
            headers: { 'content-type': 'text/html' },
            capturedAt: new Date().toISOString(),
            truncated: false,
          });
          return { body, capture };
        },
      },
    },
    100000,
  );
  const archives = new ArchiveService({ ...configuration(), archiveDir: root });
  try {
    for (const [index, response] of [
      { errors: [{ message: 'Invalid variable' }] },
      { data: { shop: {}, product: {}, selected: {} }, errors: [{ message: 'Partial failure' }] },
      { data: { shop: {}, product: {}, selected: null } },
    ].entries()) {
      payload = response;
      for (const enabled of [false, true]) {
        const task = validateTask({
          taskId: `errors-${index}-${enabled}`,
          url,
          context: {
            version: 1,
            acquisition: {
              mode: 'api',
              provider: 'shopify',
              store: {
                shopDomain: 'example.myshopify.com',
                country: 'CA',
                language: 'EN',
                currency: 'CAD',
              },
            },
            parsing: { strategy: 'shopify' },
            fallback: enabled
              ? [{ on: ['incomplete'], acquisition: { mode: 'browser', browser: 'camoufox' } }]
              : [],
          },
        });
        const archive = archives.create(task.taskId, 'attempt', url);
        await archive.initialize();
        const context = CrawlContextSchema.parse(task.context);
        if (enabled) {
          const result = await engine.fetch(url, archive, context);
          assert.equal(result.acquisition.attempts[0].reason, 'incomplete');
          assert.equal(result.capture.kind, 'rendered-dom');
          assert.equal(archive.raw.selectedCapture, 2);
        } else
          await assert.rejects(
            engine.fetch(url, archive, context),
            (error: unknown) =>
              error instanceof Error && 'reason' in error && error.reason === 'incomplete',
          );
        assert.equal(archive.raw.captures[1].kind, 'api-response');
        await archive.seal();
        await archive.finalize();
        assert.deepEqual(
          JSON.parse(
            (await readAuditBundle(archive.bundlePath)).get('response-1.body')!.toString(),
          ),
          payload,
        );
      }
    }
    assert.equal(browserCalls, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
