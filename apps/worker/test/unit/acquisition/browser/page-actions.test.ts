import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { executeAction } from '../../../../src/acquisition/browser/executors/page-actions.ts';
import { AcquisitionError } from '../../../../src/acquisition/acquisition.types.ts';

test('AI executor calls the selected page and preserves a failed action result for audit', async () => {
  const calls: unknown[] = [];
  const page = {
    act: async (...args: unknown[]) => {
      calls.push(args);
      return { success: false, message: 'No matching control', actions: [] };
    },
  } as unknown as Page;
  const record = await executeAction(
    page,
    { type: 'act', instruction: 'Expand specifications' },
    500,
  );
  assert.deepEqual(calls, [['Expand specifications', { timeout: 500 }]]);
  assert.ok(record.result);
  assert.equal(record.result.success, false);
});
test('AI executor does not expose model connection errors or credentials', async () => {
  const page = {
    act: async () => {
      throw new Error('request failed with secret-api-key');
    },
  } as unknown as Page;
  await assert.rejects(
    executeAction(page, { type: 'act', instruction: 'Expand specifications' }, 500),
    (error) =>
      error instanceof AcquisitionError &&
      error.reason === 'interaction_failed' &&
      !error.message.includes('secret-api-key'),
  );
});
