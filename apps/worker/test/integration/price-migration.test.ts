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

test('price migration converts existing rows and business JSON exactly; rejects fractional minor units atomically', async () => {
  const config = configuration();
  const admin = new PrismaService(config);
  const schema = `price_migration_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(config.databaseUrl);
  url.searchParams.set('schema', schema);
  // Adapter schema qualifies generated queries; raw SQL needs an explicit search_path.
  url.searchParams.set('options', `-c search_path=${schema}`);
  const db = new PrismaService({ ...config, databaseUrl: url.href });
  const migrate = () =>
    execute(
      process.execPath,
      [
        prismaCli,
        'db',
        'execute',
        '--file',
        'prisma/migrations/20261009030000_price_minor_units/migration.sql',
      ],
      {
        cwd: join(projectRoot, 'apps/worker'),
        env: { ...process.env, DATABASE_URL: url.href },
      },
    );
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await db.$executeRawUnsafe(
      'CREATE TABLE price_observations (amount numeric(24,6), currency text, evidence text)',
    );
    await db.$executeRawUnsafe('CREATE TABLE tracked_products (data jsonb)');
    await db.$executeRawUnsafe('CREATE TABLE product_observations (data jsonb)');
    await db.$executeRawUnsafe(`INSERT INTO price_observations VALUES
      (89.99, 'CAD', 'fixture'), (129.95, 'USD', 'fixture'), (199, 'JPY', 'fixture'),
      (1.234, 'KWD', 'fixture'), (1.25, 'HUF', 'fixture'), (1.2345, 'CLF', 'fixture'),
      (0.001, 'CAD', 'invalid')`);
    const product = {
      offers: [
        { amount: '89.99', currency: 'CAD', evidence: 'fixture' },
        { amount: '1.234', currency: 'KWD', evidence: 'fixture' },
      ],
    };
    for (const table of ['tracked_products', 'product_observations'])
      await db.$executeRawUnsafe(
        `INSERT INTO ${table} VALUES ($1::jsonb)`,
        JSON.stringify(product),
      );
    await assert.rejects(migrate(), /cannot be represented/);
    const columns = await db.$queryRawUnsafe<{ column_name: string }[]>(
      'SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2',
      schema,
      'price_observations',
    );
    assert.ok(columns.some((column) => column.column_name === 'amount'));
    assert.ok(!columns.some((column) => column.column_name === 'amount_minor'));
    await db.$executeRawUnsafe("DELETE FROM price_observations WHERE evidence='invalid'");
    await migrate();
    const rows = await db.$queryRawUnsafe<
      { currency: string; amount_minor: bigint; compare_at_amount_minor: bigint | null }[]
    >('SELECT * FROM price_observations');
    assert.deepEqual(
      Object.fromEntries(rows.map((row) => [row.currency, Number(row.amount_minor)])),
      { CAD: 8999, USD: 12995, JPY: 199, KWD: 1234, HUF: 125, CLF: 12345 },
    );
    assert.ok(rows.every((row) => row.compare_at_amount_minor === null));
    for (const table of ['tracked_products', 'product_observations']) {
      const [row] = await db.$queryRawUnsafe<{ data: { offers: Record<string, unknown>[] } }[]>(
        `SELECT data FROM ${table}`,
      );
      assert.equal(row.data.offers[0].amountMinor, 8999);
      assert.equal(row.data.offers[1].amountMinor, 1234);
      assert.equal('amount' in row.data.offers[0], false);
    }
    await assert.rejects(
      db.$executeRawUnsafe('UPDATE price_observations SET amount_minor = 9007199254740992'),
    );
    await assert.rejects(
      db.$executeRawUnsafe(
        "UPDATE price_observations SET compare_at_amount_minor=1, compare_at_evidence='fake'",
      ),
    );
  } finally {
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  }
});
