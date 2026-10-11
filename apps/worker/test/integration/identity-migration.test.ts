import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { PrismaService } from '../../src/database/prisma.service.ts';
import { configuration, projectRoot } from '../../src/config/worker.config.ts';

const execute = promisify(execFile);
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');

test('identity migration merges duplicate URLs without dropping same-run observations or prices', async () => {
  const config = configuration();
  const schema = `identity_migration_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(config.databaseUrl);
  url.searchParams.set('schema', schema);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const admin = new PrismaService(config);
  const db = new PrismaService({ ...config, databaseUrl: url.href });
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await db.$executeRawUnsafe(
      'CREATE TABLE tracked_products (id text PRIMARY KEY, url text NOT NULL, sku text, last_observed_at timestamptz NOT NULL)',
    );
    await db.$executeRawUnsafe(
      'CREATE TABLE product_observations (id bigint PRIMARY KEY, run_id text NOT NULL, product_id text NOT NULL REFERENCES tracked_products(id), data jsonb NOT NULL)',
    );
    await db.$executeRawUnsafe(
      'CREATE UNIQUE INDEX product_observations_run_id_product_id_key ON product_observations(run_id, product_id)',
    );
    await db.$executeRawUnsafe(
      'CREATE TABLE price_observations (observation_id bigint REFERENCES product_observations(id), amount_minor bigint NOT NULL)',
    );
    await db.$executeRawUnsafe(
      `INSERT INTO tracked_products VALUES ('old', 'https://shop.example/p', 'SKU', '2026-10-08'), ('new', 'https://shop.example/p', NULL, '2026-10-09'), ('variant', 'https://shop.example/p?variant=2', 'SKU', '2026-10-09')`,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO product_observations VALUES (1, 'run', 'old', '{"sku":"SKU"}'), (2, 'run', 'new', '{"sku":null}'), (3, 'run', 'variant', '{"sku":"SKU"}')`,
    );
    await db.$executeRawUnsafe(
      'INSERT INTO price_observations VALUES (1, 100), (2, 200), (3, 300)',
    );
    await execute(
      process.execPath,
      [
        prismaCli,
        'db',
        'execute',
        '--file',
        'prisma/migrations/20261009040000_stable_product_identity/migration.sql',
      ],
      {
        cwd: join(projectRoot, 'apps/worker'),
        env: { ...process.env, DATABASE_URL: url.href },
      },
    );
    const products = await db.$queryRawUnsafe<{ id: string }[]>(
      'SELECT id FROM tracked_products ORDER BY id',
    );
    assert.deepEqual(
      products.map((p) => p.id),
      ['new', 'variant'],
    );
    const observations = await db.$queryRawUnsafe<
      { id: bigint; product_id: string; data: unknown }[]
    >('SELECT * FROM product_observations ORDER BY id');
    assert.equal(observations.length, 3);
    assert.deepEqual(
      observations.map((o) => o.product_id),
      ['new', 'new', 'variant'],
    );
    assert.deepEqual(observations[0].data, { sku: 'SKU' });
    const prices = await db.$queryRawUnsafe<{ amount_minor: bigint }[]>(
      'SELECT amount_minor FROM price_observations ORDER BY observation_id',
    );
    assert.deepEqual(
      prices.map((p) => p.amount_minor),
      [100n, 200n, 300n],
    );
    await assert.rejects(
      db.$executeRawUnsafe(
        `INSERT INTO tracked_products VALUES ('duplicate', 'https://shop.example/p', NULL, now(), encode(sha256(convert_to('https://shop.example/p', 'UTF8')), 'hex'))`,
      ),
    );
  } finally {
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  }
});
