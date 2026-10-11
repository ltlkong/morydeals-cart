import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { CrawlTaskSchema, type PageClassification } from '@morydeals/capture-contracts';
import { configuration } from '../../../src/config/worker.config.ts';
import { PageVisitService } from '../../../src/classification/page-visit.service.ts';
import type { PageTypeService } from '../../../src/classification/page-type.service.ts';
import type { CapturePipelineService } from '../../../src/pipeline/capture-pipeline.service.ts';

const visit = async (
  productProbability: number,
  readiness: PageClassification['readiness'] = 'ready',
) => {
  const root = await mkdtemp(join(tmpdir(), 'visit-'));
  const url = 'https://shop.example/mugs';
  const bytes = Buffer.from(
    JSON.stringify({ url, html: '<h1>Mugs</h1>', capturedAt: new Date().toISOString() }),
  );
  const id = '7fb09191-305a-4b5a-b2b7-f12ab9f541b3';
  const file = join(root, `${id}.json.gz`);
  await writeFile(file, gzipSync(bytes));
  const task = CrawlTaskSchema.parse({
    taskId: 'visit',
    url,
    intent: 'browse',
    snapshot: { id, sha256: hash('sha256', bytes) },
  });
  const classification = {
    source: 'model',
    provider: 'fake',
    probabilities: {},
    productProbability,
    readiness,
  } as PageClassification;
  let captured = 0;
  const service = new PageVisitService(
    { classify: async () => classification } as unknown as PageTypeService,
    {
      run: async () => {
        captured++;
        return { status: 'parsed' };
      },
    } as unknown as CapturePipelineService,
    { ...configuration({}), snapshotDirectory: root },
  );
  const result = await service.run(task);
  const kept = await access(file).then(
    () => true,
    () => false,
  );
  await rm(root, { recursive: true, force: true });
  return { result, captured, kept };
};

test('a likely product page runs the full capture and carries its classification', async () => {
  const { result, captured, kept } = await visit(0.82);
  assert.equal(captured, 1);
  assert.equal(
    (result as { classification: PageClassification }).classification.productProbability,
    0.82,
  );
  assert.equal(kept, true); // the capture pipeline removes it after persisting
});

test('any other page is dropped: no capture and no staged HTML left behind', async () => {
  const { result, captured, kept } = await visit(0.4);
  assert.equal(captured, 0);
  assert.equal(result.status, 'not_product');
  assert.equal(kept, false);
});

test('a product page that is not ready is dropped with its reason, never parsed', async () => {
  for (const readiness of ['needs_selection', 'not_loaded'] as const) {
    const { result, captured, kept } = await visit(0.95, readiness);
    assert.equal(captured, 0, readiness);
    assert.equal(result.status, readiness);
    assert.equal(
      (result as { classification: PageClassification }).classification.readiness,
      readiness,
    );
    assert.equal(kept, false, readiness);
  }
});

test('automatic visits must carry a page snapshot', () => {
  assert.throws(
    () => CrawlTaskSchema.parse({ taskId: 'x', url: 'https://shop.example/', intent: 'browse' }),
    /snapshot/,
  );
});
