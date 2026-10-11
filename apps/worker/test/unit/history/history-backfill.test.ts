import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configuration } from '../../../src/config/worker.config.ts';
import { HistoryBackfillService } from '../../../src/history/history-backfill.service.ts';
import type { KeepaClient } from '../../../src/history/keepa.client.ts';
import type { PrismaService } from '../../../src/database/prisma.service.ts';
import { keepaDate } from '../../../src/history/keepa-history.ts';

const setup = (tokensLeft: number) => {
  const requested: string[][] = [];
  const written: { productId: string; amountMinor: bigint | null }[] = [];
  const syncs = new Map<string, string | null>();
  let limit = 0;
  const keepa = {
    enabled: true,
    tokensLeft: async () => tokensLeft,
    buyBoxHistory: async (asins: string[]) => {
      requested.push(asins);
      return new Map([
        [
          'B00MW8G3YU',
          [
            { observedAt: keepaDate(8294807), amountMinor: 1709, shippingMinor: 0 },
            { observedAt: keepaDate(8294900), amountMinor: null, shippingMinor: null },
          ],
        ],
      ]);
    },
  } as unknown as KeepaClient;
  const prisma = {
    $queryRaw: async (_: TemplateStringsArray, ...values: unknown[]) => {
      limit = Number(values.at(-1));
      return [
        { id: 'p1', url: 'https://www.amazon.ca/dp/B00MW8G3YU' },
        { id: 'p2', url: 'https://www.amazon.ca/dp/B0D2JGYX3F' },
      ].slice(0, limit);
    },
    externalPricePoint: {
      createMany: async ({
        data,
      }: {
        data: { productId: string; amountMinor: bigint | null }[];
      }) => {
        written.push(...data);
        return { count: data.length };
      },
    },
    externalHistorySync: {
      upsert: async ({ create }: { create: { productId: string; lastError: string | null } }) => {
        syncs.set(create.productId, create.lastError);
      },
    },
  } as unknown as PrismaService;
  const service = new HistoryBackfillService(keepa, prisma, configuration({}));
  return { service, requested, written, syncs, limit: () => limit };
};

test('a run fetches within the token budget, stores gaps, and marks unknown products', async () => {
  const { service, requested, written, syncs, limit } = setup(1200);
  assert.deepEqual(await service.runOnce(), { fetched: 2, points: 2 });
  assert.equal(limit(), 6); // 20 tokens a minute / 3 per product
  assert.deepEqual(requested, [['B00MW8G3YU', 'B0D2JGYX3F']]);
  assert.deepEqual(
    written.map((p) => [p.productId, p.amountMinor]),
    [
      ['p1', 1709n],
      ['p1', null],
    ],
  );
  assert.deepEqual(
    [...syncs],
    [
      ['p1', null],
      ['p2', 'Not found on Keepa'],
    ],
  );
});

test('a run without enough tokens asks Keepa for nothing', async () => {
  const { service, requested } = setup(2);
  assert.deepEqual(await service.runOnce(), { fetched: 0, points: 0 });
  assert.deepEqual(requested, []);
});
