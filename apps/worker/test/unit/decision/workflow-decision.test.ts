import { DocumentPreparationService } from '../../../src/parsing/document/document-preparation.service.ts';
import { AuditReplayService } from '../../../src/audit/audit-replay.service.ts';
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowDecisionService } from '../../../src/decision/workflow-decision.service.ts';
import { retailerForUrl } from '../../../src/parsing/parsers/index.ts';
import { AcquisitionRunner } from '../../../src/acquisition/acquisition.runner.ts';
import { CaptureWorkflowService } from '../../../src/pipeline/capture-workflow.service.ts';
import { ArchiveService } from '../../../src/audit/archive.service.ts';
import { Archive } from '../../../src/audit/raw-archive.ts';
import { readAuditBundle } from '../../../src/audit/audit-bundle.ts';
import {
  AcquisitionError,
  type AcquisitionDriver,
} from '../../../src/acquisition/acquisition.types.ts';
import { AutoContextSchema, CrawlContextSchema, validateTask } from '@morydeals/capture-contracts';
import { configuration } from '../../../src/config/worker.config.ts';
import { detectShopify } from '../../../src/parsing/parsers/index.ts';

const auto = () => AutoContextSchema.parse({ version: 1, decision: { mode: 'auto' } });
const shopify = `<h1>Selected product</h1><p>${'Product detail. '.repeat(10)}</p><script>
Shopify.shop = 'example.myshopify.com'; Shopify.country = "CA"; Shopify.locale = "en";
Shopify.currency = {"active":"CAD","rate":"1.0"};</script>`;
const unknown = `<h1>Product</h1><p>CAD 49.99</p><p>${'Details of the current product. '.repeat(10)}</p>`;
const htmlDriver = (html: string, count: () => void, rendered = false): AcquisitionDriver => ({
  fetch: async ({ archive, url }) => {
    count();
    const body = Buffer.from(html);
    const capture = await archive.capture(body, {
      kind: rendered ? 'rendered-dom' : 'http-response',
      url,
      status: 200,
      headers: { 'content-type': 'text/html' },
      capturedAt: new Date().toISOString(),
      truncated: false,
    });
    return { body, capture, html };
  },
});
async function fixture(url: string, driver: AcquisitionDriver) {
  const root = await mkdtemp(join(tmpdir(), 'mory-decision-'));
  const archive = new Archive(root, 'decision', 'attempt', url);
  await archive.initialize();
  const runner = new AcquisitionRunner({ http: driver, browser: driver }, 100000);
  return {
    root,
    archive,
    runner,
    decider: new WorkflowDecisionService(runner),
    close: () => rm(root, { recursive: true, force: true }),
  };
}

test('known retailer decisions use exact URL rules and do not probe the network', async () => {
  const f = await fixture('https://example.com', {
    fetch: async () => {
      throw new Error('Unexpected network');
    },
  });
  try {
    for (const [url, platform, mode] of [
      ['https://www.amazon.ca/dp/B0FF3549YB', 'amazon-ca', 'http'],
      ['https://www.walmart.ca/en/ip/sofa/4SV84AV3CA6F', 'walmart-ca', 'http'],
      ['https://www.bestbuy.ca/en-ca/product/19190432', 'bestbuy-ca', 'browser'],
      ['https://www.newegg.ca/p/9SIC7XMM4F0269?Item=9SIC7XMM4F0269', 'newegg-ca', 'browser'],
    ]) {
      const plan = await f.decider.decide(url, auto(), f.archive);
      assert.equal(plan.decision!.platform, platform);
      assert.equal(plan.context.acquisition.mode, mode);
      assert.equal(plan.context.parsing!.strategy, platform);
    }
    for (const url of [
      'https://www.amazon.ca.evil.test/dp/B0FF3549YB',
      'https://unknown.example/?url=https://www.bestbuy.ca/en-ca/product/19190432',
      'https://bestbuy.ca/about',
      'https://www.walmart.ca.evil.test/en/ip/sofa/4SV84AV3CA6F',
    ])
      assert.equal(retailerForUrl(url), undefined);
  } finally {
    await f.close();
  }
});
test('Shopify detection requires a declaration; products path/CDN links alone do not prove platform', () => {
  assert.equal(detectShopify('<img src="https://cdn.shopify.com/x.jpg">').shopDomain, undefined);
  const result = detectShopify(shopify);
  assert.equal(result.shopDomain, 'example.myshopify.com');
  assert.equal(result.currency, 'CAD');
  assert.equal(result.country, 'CA');
  const conflict = detectShopify(shopify + '<script>Shopify.shop="other.myshopify.com";</script>');
  assert.equal(conflict.shopDomain, undefined);
  assert.ok(conflict.issues.length);
});
test('Shopify workflow derives store and market from the probe and passes that page to API driver', async () => {
  let reads = 0;
  const url = 'https://example.com/products/selected?variant=202';
  const f = await fixture(
    url,
    htmlDriver(shopify, () => reads++),
  );
  try {
    const plan = await f.decider.decide(url, auto(), f.archive);
    assert.equal(plan.decision!.platform, 'shopify');
    assert.equal(reads, 1);
    assert.ok(plan.page);
    assert.equal(plan.context.acquisition.mode, 'api');
    if (plan.context.acquisition.mode === 'api' && plan.context.acquisition.provider === 'shopify')
      assert.deepEqual(plan.context.acquisition.store, {
        shopDomain: 'example.myshopify.com',
        country: 'CA',
        language: 'EN',
        currency: 'CAD',
      });
    let apiCalls = 0;
    const api = new AcquisitionRunner(
      {
        api: {
          fetch: async (request) => {
            apiCalls++;
            assert.equal(request.prefetchedPage, plan.page);
            return plan.page!;
          },
        },
      },
      100000,
    );
    await api.fetch(url, f.archive, plan.context, { page: plan.page });
    assert.equal(apiCalls, 1);
    assert.equal(reads, 1);
    assert.ok(
      (
        await f.archive
          .seal()
          .then(() => f.archive.finalize())
          .then(() => readAuditBundle(f.archive.bundlePath))
      ).has('probe-acquisition.json'),
    );
  } finally {
    await f.close();
  }
});
test('unknown domains get generic workflow and reuse the probe without a second page request', async () => {
  let reads = 0;
  const f = await fixture(
    'https://unknown.example/product',
    htmlDriver(unknown, () => reads++),
  );
  try {
    const plan = await f.decider.decide(f.archive.raw.requestedUrl, auto(), f.archive);
    assert.equal(plan.decision!.platform, 'unknown');
    assert.equal(plan.context.parsing!.strategy, 'generic');
    const result = await f.runner.fetch(f.archive.raw.requestedUrl, f.archive, plan.context, {
      page: plan.page,
    });
    assert.equal(reads, 1);
    assert.equal(result.acquisition.attempts[0].reused, true);
  } finally {
    await f.close();
  }
});
test('unknown Shopify market or variant keeps deterministic page strategy instead of guessing CAD or first variant', async () => {
  const f = await fixture(
    'https://example.com/products/selected',
    htmlDriver(shopify.replace('Shopify.country = "CA";', ''), () => {}),
  );
  try {
    const plan = await f.decider.decide(f.archive.raw.requestedUrl, auto(), f.archive);
    assert.equal(plan.decision!.platform, 'shopify');
    assert.equal(plan.context.acquisition.mode, 'http');
    assert.equal(plan.context.parsing!.strategy, 'shopify');
    assert.ok(plan.decision!.issues.length);
  } finally {
    await f.close();
  }
});
test('explicit workflow bypasses decision and automatic replay restores the recorded workflow offline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mory-auto-replay-'));
  let reads = 0;
  const runner = new AcquisitionRunner({ http: htmlDriver(unknown, () => reads++) }, 100000);
  const decider = new WorkflowDecisionService(runner);
  const explicit = CrawlContextSchema.parse({
    version: 1,
    acquisition: { mode: 'http' },
    parsing: { strategy: 'structured' },
  });
  const archives = new ArchiveService({ ...configuration(), archiveDir: root });
  const service = new CaptureWorkflowService(
    runner,
    archives,
    decider,
    new DocumentPreparationService({ maxBytes: 5000000 }),
    new AuditReplayService(archives),
  );
  const task = validateTask({ taskId: 'automatic', url: 'https://unknown.example/product' });
  try {
    const archive = service.archive(task, 'first');
    assert.deepEqual(await decider.decide(task.url, explicit, archive), { context: explicit });
    assert.equal(reads, 0);
    const first = await service.capture(task, archive);
    assert.equal(first.context.parsing!.strategy, 'generic');
    assert.equal(reads, 1);
    await archive.finalize();
    const next = validateTask({ ...task, taskId: 'replay' });
    const replayArchive = service.archive(next, 'second');
    const replay = await service.capture(next, replayArchive, archive.id);
    assert.equal(reads, 1);
    assert.deepEqual(replay.context, JSON.parse(JSON.stringify(first.context)));
    assert.equal(replay.decision!.replayOf, archive.id);
    await replayArchive.finalize();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('HTTP rejection probes the browser once and reuses its rendered page', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mory-probe-browser-'));
  const archive = new Archive(root, 'probe', 'attempt', 'https://unknown.example/product');
  await archive.initialize();
  let renders = 0;
  const runner = new AcquisitionRunner(
    {
      http: {
        fetch: async () => {
          throw new AcquisitionError('blocked', 'HTTP 403');
        },
      },
      browser: htmlDriver(unknown, () => renders++, true),
    },
    100000,
  );
  try {
    const plan = await new WorkflowDecisionService(runner).decide(
      archive.raw.requestedUrl,
      auto(),
      archive,
    );
    assert.equal(plan.context.acquisition.mode, 'browser');
    await runner.fetch(archive.raw.requestedUrl, archive, plan.context, { page: plan.page });
    assert.equal(renders, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('probe and selected workflow share one acquisition budget', async () => {
  const slow = htmlDriver(unknown, () => {});
  const f = await fixture('https://unknown.example/product', {
    fetch: async (request) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return slow.fetch(request);
    },
  });
  try {
    const input = AutoContextSchema.parse({
      version: 1,
      decision: { mode: 'auto' },
      budgetMs: 100,
    });
    await assert.rejects(
      f.decider.decide(f.archive.raw.requestedUrl, input, f.archive),
      /exhausted/,
    );
  } finally {
    await f.close();
  }
});

test('unknown HTTP template upgrades once to rendered product content and preserves both captures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mory-product-readiness-'));
  const archive = new Archive(root, 'readiness', 'attempt', 'https://store.example/item?variant=1');
  await archive.initialize();
  let httpCalls = 0,
    browserCalls = 0;
  const runner = new AcquisitionRunner(
    {
      http: htmlDriver(
        `<header>${'Promotional navigation. '.repeat(10)}</header><main></main>`,
        () => httpCalls++,
      ),
      browser: htmlDriver(
        '<main><h1>Cat tree</h1><p>CAD 99.99</p></main>',
        () => browserCalls++,
        true,
      ),
    },
    100000,
  );
  try {
    const plan = await new WorkflowDecisionService(runner).decide(
      archive.raw.requestedUrl,
      auto(),
      archive,
    );
    const result = await runner.fetch(archive.raw.requestedUrl, archive, plan.context, {
      page: plan.page,
    });
    assert.equal(httpCalls, 1);
    assert.equal(browserCalls, 1);
    assert.equal(result.capture.kind, 'rendered-dom');
    assert.deepEqual(
      result.acquisition.attempts.map((a) => a.reason ?? a.status),
      ['incomplete', 'ready'],
    );
    assert.equal(archive.raw.captures.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
