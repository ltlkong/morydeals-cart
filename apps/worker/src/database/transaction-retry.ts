import pRetry from 'p-retry';
import { isDriverAdapterError } from '@prisma/driver-adapter-utils';
import { Prisma } from '../generated/prisma/client.ts';

/** Retry the entire rolled-back transaction, including conflicts raised during COMMIT. */
export function retryTransaction<T>(transaction: () => Promise<T>): Promise<T> {
  return pRetry(transaction, {
    retries: 4,
    minTimeout: 25,
    maxTimeout: 200,
    randomize: true,
    shouldRetry: ({ error }) =>
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2034', 'P2002'].includes(error.code)) ||
      (isDriverAdapterError(error) && error.cause.kind === 'TransactionWriteConflict'),
  });
}
