import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { CrawlTaskSchema } from '@morydeals/capture-contracts';
import { configuration } from '../../../src/config/worker.config.ts';
import { Archive } from '../../../src/audit/raw-archive.ts';
import { readPageSnapshot } from '../../../src/pipeline/page-snapshot.ts';
test('uploaded HTML is independently parsed and audited without a network driver', async () => {
  const root = await mkdtemp(join(tmpdir(), 'snapshot-'));
  try {
    const url = 'https://shop.example/product';
    const html =
      '<script type="application/ld+json">{"@type":"Product","name":"Desk","url":"https://shop.example/product","offers":{"@type":"Offer","price":"19.99","priceCurrency":"CAD"}}</script>';
    const capturedAt = new Date().toISOString();
    const bytes = Buffer.from(JSON.stringify({ url, html, capturedAt }));
    const id = '7fb09191-305a-4b5a-b2b7-f12ab9f541b3';
    await writeFile(join(root, `${id}.json.gz`), gzipSync(bytes));
    const task = CrawlTaskSchema.parse({
      taskId: 'snapshot-test',
      url,
      snapshot: { id, sha256: hash('sha256', bytes) },
    });
    const archive = new Archive(root, 'snapshot-test', 'attempt', url);
    await archive.initialize();
    const result = await readPageSnapshot(task, archive, {
      ...configuration({}),
      snapshotDirectory: root,
    });
    assert.equal(result.page.html, html);
    assert.equal(result.page.capture.headers['x-mory-source'], 'user-webview');
    assert.equal(archive.raw.selectedCapture, 0);
    // The server parses the snapshot once, in the parsing stage; no client result exists to archive.
    await assert.rejects(access(join(archive.directory, 'client-result.json')));
    await assert.rejects(
      readPageSnapshot({ ...task, snapshot: { id, sha256: '0'.repeat(64) } }, archive, {
        ...configuration({}),
        snapshotDirectory: root,
      }),
      /integrity mismatch/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
