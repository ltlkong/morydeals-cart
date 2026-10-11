import { DocumentPreparationService } from '../../../src/parsing/document/document-preparation.service.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AcquisitionRunner } from '../../../src/acquisition/acquisition.runner.ts';
import { Archive } from '../../../src/audit/raw-archive.ts';
import {
  AcquisitionError,
  type AcquisitionDriver,
} from '../../../src/acquisition/acquisition.types.ts';
import type { CrawlContextInput } from '@morydeals/capture-contracts';

async function fixture(
  context: CrawlContextInput,
  drivers: Record<'http' | 'browser' | 'interactive', AcquisitionDriver>,
) {
  const root = await mkdtemp(join(tmpdir(), 'mory-context-'));
  const archive = new Archive(root, 'task', 'attempt', 'https://example.com/product');
  await archive.initialize();
  const acquisition = new AcquisitionRunner(drivers, 100000);
  return { archive, acquisition, cleanup: () => rm(root, { recursive: true, force: true }) };
}
const captured = (html: string): AcquisitionDriver => ({
  fetch: async ({ archive, url }) => {
    const body = Buffer.from(html);
    const capture = await archive.capture(body, {
      url,
      status: 200,
      headers: { 'content-type': 'text/html' },
      capturedAt: new Date().toISOString(),
      truncated: false,
    });
    return { body, capture, html };
  },
});
const unsupported = {
  fetch: async () => {
    throw new Error('Unexpected execution');
  },
};

test('explicit browser start skips HTTP and does not invent fallback', async () => {
  const context = {
    version: 1 as const,
    acquisition: { mode: 'browser' as const, browser: 'camoufox' as const },
  };
  const f = await fixture(context, {
    http: unsupported,
    browser: captured('<h1>Ready</h1>'),
    interactive: unsupported,
  });
  try {
    const result = await f.acquisition.fetch(f.archive.raw.requestedUrl, f.archive, context);
    assert.equal(result.acquisition.attempts.length, 1);
    assert.equal(result.acquisition.attempts[0].mode, 'browser');
  } finally {
    await f.cleanup();
  }
});
test('fallback executes only configured matching conditions and preserves each response', async () => {
  const context: CrawlContextInput = {
    version: 1,
    acquisition: { mode: 'http', waitFor: { selector: '[data-product]' } },
    fallback: [{ on: ['incomplete'], acquisition: { mode: 'browser', browser: 'camoufox' } }],
  };
  const f = await fixture(context, {
    http: captured('<p>Loading</p>'),
    browser: captured('<h1 data-product>Product</h1>'),
    interactive: unsupported,
  });
  try {
    const result = await f.acquisition.fetch(f.archive.raw.requestedUrl, f.archive, context);
    assert.deepEqual(
      result.acquisition.attempts.map((a) => a.status),
      ['failed', 'ready'],
    );
    assert.equal(f.archive.raw.captures.length, 2);
    assert.equal(f.archive.raw.selectedCapture, 1);
    await f.archive.seal();
    await new DocumentPreparationService({ maxBytes: 5000000 }).prepare(result, f.archive, context);
    assert.ok((await readFile(join(f.archive.directory, 'page.md'), 'utf8')).includes('Product'));
  } finally {
    await f.cleanup();
  }
});
test('a mismatch ends execution with a structured reason', async () => {
  const context: CrawlContextInput = {
    version: 1,
    acquisition: { mode: 'http', waitFor: { selector: '.price' } },
    fallback: [{ on: ['timeout'], acquisition: { mode: 'browser', browser: 'camoufox' } }],
  };
  const f = await fixture(context, {
    http: captured('<h1>No price</h1>'),
    browser: unsupported,
    interactive: unsupported,
  });
  try {
    await assert.rejects(
      f.acquisition.fetch(f.archive.raw.requestedUrl, f.archive, context),
      (error) =>
        error instanceof AcquisitionError &&
        error.reason === 'incomplete' &&
        error.result?.attempts.length === 1,
    );
  } finally {
    await f.cleanup();
  }
});
test('cancelled attempts finish before a configured fallback begins', async () => {
  const order: string[] = [];
  const slow: AcquisitionDriver = {
    fetch: async ({ signal }) => {
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      order.push('cancelled');
      throw new Error('Acquisition step timeout');
    },
  };
  const browser: AcquisitionDriver = {
    fetch: async (request) => {
      order.push('fallback');
      return captured('<h1>Ready</h1>').fetch(request);
    },
  };
  const context: CrawlContextInput = {
    version: 1,
    acquisition: { mode: 'http', timeoutMs: 100 },
    fallback: [{ on: ['timeout'], acquisition: { mode: 'browser', browser: 'camoufox' } }],
  };
  const f = await fixture(context, { http: slow, browser, interactive: unsupported });
  try {
    await f.acquisition.fetch(f.archive.raw.requestedUrl, f.archive, context);
    assert.deepEqual(order, ['cancelled', 'fallback']);
  } finally {
    await f.cleanup();
  }
});
test('concurrent response archival assigns distinct immutable files', async () => {
  const context: CrawlContextInput = { version: 1, acquisition: { mode: 'http' } };
  const f = await fixture(context, {
    http: unsupported,
    browser: unsupported,
    interactive: unsupported,
  });
  try {
    const info = {
      url: 'https://example.com',
      status: 200,
      headers: { 'content-type': 'text/html' },
      capturedAt: new Date().toISOString(),
      truncated: false,
    };
    const captures = await Promise.all([
      f.archive.capture(Buffer.from('one'), info),
      f.archive.capture(Buffer.from('two'), info),
    ]);
    assert.deepEqual(
      captures.map((c) => c.file),
      ['response-0.body', 'response-1.body'],
    );
  } finally {
    await f.cleanup();
  }
});

test('exception wording cannot trigger fallback or turn a programming error into a retryable network failure', async () => {
  const original = new TypeError('HTTP 503 timeout not HTML');
  let fallbackCalls = 0;
  const context: CrawlContextInput = {
    version: 1,
    acquisition: { mode: 'http' },
    fallback: [
      {
        on: ['timeout', 'http_error', 'network_error', 'unsupported_content'],
        acquisition: { mode: 'browser', browser: 'camoufox' },
      },
    ],
  };
  const f = await fixture(context, {
    http: {
      fetch: async () => {
        throw original;
      },
    },
    browser: {
      fetch: async () => {
        fallbackCalls++;
        throw new Error('Must not run');
      },
    },
    interactive: unsupported,
  });
  try {
    await assert.rejects(
      f.acquisition.fetch(f.archive.raw.requestedUrl, f.archive, context),
      (error) => error === original,
    );
    assert.equal(fallbackCalls, 0);
  } finally {
    await f.cleanup();
  }
});

test('SDK wrapping preserves typed driver failures and configured fallback', async () => {
  const context: CrawlContextInput = {
    version: 1,
    acquisition: { mode: 'http' },
    fallback: [{ on: ['network_error'], acquisition: { mode: 'browser', browser: 'camoufox' } }],
  };
  const f = await fixture(context, {
    http: {
      fetch: async () => {
        throw new Error('SDK wrapper', {
          cause: new AcquisitionError('network_error', 'Remote connection failed', true),
        });
      },
    },
    browser: captured('<h1>Ready</h1>'),
    interactive: unsupported,
  });
  try {
    const result = await f.acquisition.fetch(f.archive.raw.requestedUrl, f.archive, context);
    assert.equal(result.acquisition.attempts[0].reason, 'network_error');
    assert.equal(result.acquisition.attempts[1].status, 'ready');
  } finally {
    await f.cleanup();
  }
});

test('Amazon verification HTML cannot satisfy readiness just by containing enough text', async () => {
  const context: CrawlContextInput = {
    version: 1,
    acquisition: { mode: 'browser', browser: 'camoufox', waitFor: { minTextLength: 10 } },
  };
  const f = await fixture(context, {
    http: unsupported,
    interactive: unsupported,
    browser: captured(
      '<form action="/errors_page/validateCaptcha"><button>Continue shopping</button></form>',
    ),
  });
  try {
    await assert.rejects(
      f.acquisition.fetch('https://www.amazon.ca/dp/B0CZ6XY78Y', f.archive, context),
      (error) => error instanceof AcquisitionError && error.reason === 'blocked',
    );
    assert.equal(f.archive.raw.selectedCapture, undefined);
    assert.equal(f.archive.raw.captures.length, 1);
  } finally {
    await f.cleanup();
  }
});
