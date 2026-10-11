import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTask, CrawlContextSchema } from '@morydeals/capture-contracts';
import { createBrowserRegistry } from '../../../src/acquisition/browser/browser.factory.ts';

test('explicit contexts require acquisition and reject implicit merchant/trigger configuration', () => {
  assert.throws(() =>
    validateTask({ taskId: '1', url: 'https://example.com', context: { version: 1 } }),
  );
  assert.throws(() =>
    validateTask({
      taskId: '1',
      url: 'https://example.com',
      trigger: 'daily',
      context: { version: 1, acquisition: { mode: 'http' } },
    }),
  );
  assert.throws(() =>
    validateTask({
      taskId: '../bad',
      url: 'https://example.com',
      context: { version: 1, acquisition: { mode: 'http' } },
    }),
  );
  const parsed = validateTask({
    taskId: '1',
    url: 'https://example.com',
    context: { version: 1, acquisition: { mode: 'browser', browser: 'camoufox' } },
  });
  assert.ok('acquisition' in parsed.context);
  assert.equal(parsed.context.acquisition.mode, 'browser');
  assert.deepEqual(parsed.context.fallback, []);
});
test('Camoufox and Stagehand compatibility is validated before launching', () => {
  const parsed = CrawlContextSchema.parse({
    version: 1,
    acquisition: {
      mode: 'interactive',
      browser: 'camoufox',
      model: 'openai/test',
      actions: [{ type: 'act', instruction: 'Expand details' }],
    },
  });
  assert.ok('browser' in parsed.acquisition);
  const browser = parsed.acquisition.browser;
  assert.throws(() => createBrowserRegistry().resolve(browser, true), /does not support Stagehand/);
  assert.throws(() =>
    CrawlContextSchema.parse({
      version: 1,
      acquisition: {
        mode: 'browser',
        browser: 'camoufox',
        actions: [{ type: 'act', instruction: 'Expand details' }],
      },
    }),
  );
});
test('does not accept arbitrary browser endpoints, credentials or executable code from jobs', () => {
  for (const extra of [
    { wsEndpoint: 'ws://127.0.0.1' },
    { apiKey: 'secret' },
    { evaluate: 'process.exit()' },
    { timeoutMs: 999999 },
  ]) {
    assert.throws(() =>
      CrawlContextSchema.parse({
        version: 1,
        acquisition: { mode: 'browser', browser: 'camoufox', ...extra },
      }),
    );
  }
});

test('URL-only tasks choose automatic mode while mixed automatic and explicit instructions are rejected', () => {
  const task = validateTask({ taskId: 'automatic', url: 'https://unregistered.example/product' });
  assert.ok('decision' in task.context);
  assert.equal(task.context.decision.mode, 'auto');
  assert.throws(() =>
    validateTask({
      taskId: 'mixed',
      url: task.url,
      context: { version: 1, decision: { mode: 'auto' }, acquisition: { mode: 'http' } },
    }),
  );
});
