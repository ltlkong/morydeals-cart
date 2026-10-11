import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CaptureTimings } from '../../../src/pipeline/capture-timings.ts';

test('stage timers retain failures and snapshots do not change as later stages finish', async () => {
  let now = 10;
  const timings = new CaptureTimings(() => now);
  const value = await timings.measure('acquisition', async () => {
    now += 25;
    return 'page';
  });
  assert.equal(value, 'page');
  const before = timings.snapshot('before_archive');
  await assert.rejects(
    timings.measure('conversion', () => {
      now += 7;
      throw new Error('fixture');
    }),
  );
  await timings.measure('archive', () => {
    now += 3;
  });
  assert.deepEqual(before, {
    scope: 'before_archive',
    totalMs: 25,
    stages: { acquisition: { durationMs: 25, status: 'completed' } },
  });
  assert.deepEqual(timings.snapshot('failed'), {
    scope: 'failed',
    totalMs: 35,
    stages: {
      acquisition: { durationMs: 25, status: 'completed' },
      conversion: { durationMs: 7, status: 'failed' },
      archive: { durationMs: 3, status: 'completed' },
    },
  });
});

test('LLM details are nested within parsing and failed requests retain wall-clock time', async () => {
  let now = 0;
  const timings = new CaptureTimings(() => now);
  await timings.measure('parsing', () =>
    timings.measureLlm(async () => {
      now += 20;
      return { metrics: { totalMs: 18, generationMs: 12, promptTokens: 30, outputTokens: 10 } };
    }),
  );
  const snapshot = timings.snapshot('completed');
  assert.equal(snapshot.totalMs, 20);
  assert.equal(snapshot.stages.parsing?.durationMs, 20);
  assert.equal(snapshot.llm?.requestMs, 20);
  assert.equal(snapshot.llm?.generationMs, 12);
  const failed = new CaptureTimings(() => now);
  await assert.rejects(
    failed.measureLlm(async () => {
      now += 9;
      throw new Error('offline');
    }),
  );
  assert.equal(failed.snapshot('failed').llm?.requestMs, 9);
});
