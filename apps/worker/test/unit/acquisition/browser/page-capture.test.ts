import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page, Response } from 'playwright';
import { CrawlContextSchema } from '@morydeals/capture-contracts';
import { Archive } from '../../../../src/audit/raw-archive.ts';
import { createPageCapture } from '../../../../src/acquisition/browser/page-capture.ts';

for (const finalReadable of [true, false]) {
  test(`navigation audit: unreadable intermediate with final readable=${finalReadable}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'navigation-audit-'));
    try {
      const url = 'https://shop.example/product';
      const archive = new Archive(root, 'task', 'attempt', url);
      await archive.initialize();
      const context = CrawlContextSchema.parse({
        version: 1,
        acquisition: { mode: 'browser', browser: 'camoufox' },
        parsing: { strategy: 'generic' },
      });
      const capture = createPageCapture(
        {
          url,
          archive,
          context,
          step: context.acquisition,
          stepIndex: 0,
          signal: new AbortController().signal,
        },
        10000,
      );
      const frame = {};
      let onResponse: (response: Response) => void = () => {};
      const page = {
        mainFrame: () => frame,
        setDefaultTimeout: () => {},
        route: async () => {},
        on: (_: string, handler: typeof onResponse) => {
          onResponse = handler;
        },
      } as unknown as Page;
      await capture.prepare(page, {});
      let failIntermediate: () => void = () => {};
      const intermediateBody = new Promise<Buffer>((_, reject) => {
        failIntermediate = () => reject(new Error('Navigation replaced'));
      });
      const response = (body: () => Promise<Buffer>) =>
        ({
          request: () => ({ isNavigationRequest: () => true, frame: () => frame }),
          allHeaders: async () => ({ 'content-type': 'text/html' }),
          status: () => 200,
          url: () => url,
          body,
        }) as unknown as Response;
      onResponse(response(() => intermediateBody));
      onResponse(
        response(async () => {
          if (!finalReadable) throw new Error('Body missing');
          return Buffer.from('<h1>Product</h1>');
        }),
      );
      failIntermediate();
      if (finalReadable) await capture.flush();
      else await assert.rejects(capture.flush(), /Final navigation response body unavailable/);
      assert.equal(archive.raw.captures.length, 2);
      assert.ok(
        archive.raw.captures.some((item) => item.truncated && item.headers['x-mory-body-error']),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
