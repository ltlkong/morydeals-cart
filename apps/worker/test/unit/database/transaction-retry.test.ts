import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DriverAdapterError } from '@prisma/driver-adapter-utils';
import { retryTransaction } from '../../../src/database/transaction-retry.ts';
import { Prisma } from '../../../src/generated/prisma/client.ts';

test('transaction retry covers query conflicts and raw adapter COMMIT conflicts', async () => {
  for (const error of [
    new DriverAdapterError({ kind: 'TransactionWriteConflict' }),
    new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2034',
      clientVersion: '7.10.0',
    }),
  ]) {
    let attempts = 0;
    const result = await retryTransaction(async () => {
      attempts++;
      if (attempts === 1) throw error;
      return 'committed';
    });
    assert.equal(result, 'committed');
    assert.equal(attempts, 2);
  }
});
test('transaction retry never retries application errors', async () => {
  let attempts = 0;
  const error = new Error('Lost run lease');
  await assert.rejects(
    retryTransaction(async () => {
      attempts++;
      throw error;
    }),
    error,
  );
  assert.equal(attempts, 1);
});
