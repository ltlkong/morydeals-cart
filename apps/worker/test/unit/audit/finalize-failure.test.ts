import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Archive } from '../../../src/audit/raw-archive.ts';
import { readAuditBundle } from '../../../src/audit/audit-bundle.ts';
import { finalizeFailure } from '../../../src/audit/finalize-failure.ts';
import { CaptureTimings } from '../../../src/pipeline/capture-timings.ts';

test('failure finalization seals once and preserves the original failure in one ZIP', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mory-failure-'));
  try {
    const archive = new Archive(root, 'task', 'attempt', 'https://example.com/p');
    const original = new Error('Provider unavailable');
    assert.deepEqual(await finalizeFailure(archive, original, new CaptureTimings()), []);
    const files = await readAuditBundle(archive.bundlePath);
    assert.equal(JSON.parse(files.get('failure.json')!.toString()).message, original.message);
    assert.equal(JSON.parse(files.get('raw.json')!.toString()).taskId, 'task');
    assert.equal(files.has('pipeline-failure.json'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('audit storage failure is reported separately and does not replace the capture error', async () => {
  const archive = new Archive('/unused', 'task', 'attempt', 'https://example.com/p');
  archive.initialize = async () => {
    throw new Error('Storage unavailable');
  };
  archive.seal = async () => {
    throw new Error('Cannot seal');
  };
  archive.artifact = async () => {
    throw new Error('Cannot write');
  };
  let finalized = 0;
  archive.finalize = async () => {
    finalized++;
    throw new Error('Cannot publish');
  };
  const failures = await finalizeFailure(
    archive,
    new Error('Original failure'),
    new CaptureTimings(),
  );
  assert.equal(finalized, 1);
  assert.ok(failures.includes('Storage unavailable'));
  assert.ok(failures.includes('Cannot publish'));
});
