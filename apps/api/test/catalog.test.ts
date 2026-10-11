import { DatabaseModule } from "../src/core/database/database.module.ts";
import { PrismaService } from "../src/core/database/services/prisma.service.ts";
import "reflect-metadata";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "node:crypto";
import { Global, Module, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module.ts";
import { ApiConfigModule } from "../src/core/config/config.module.ts";
import {
  apiConfig,
  loadApiConfig,
} from "../src/core/config/schema/config.schema.ts";
import { QueueModule } from "../src/core/queue/queue.module.ts";
import { QueueHealthService } from "../src/core/queue/services/queue-health.service.ts";
import { SchedulingModule } from "../src/core/scheduling/scheduling.module.ts";
import { configureHttp } from "../src/core/server/http/configure-app.ts";
import { CaptureQueue } from "../src/feature/products/providers/capture.queue.ts";
import { encodeCatalogCursor } from "../src/feature/catalog/services/catalog-cursor.ts";

const merchants = [
  { id: "allowed", domains: ["allowed.shop"], enabled: true },
  { id: "other", domains: ["other.shop"], enabled: true },
  { id: "quiet", domains: ["quiet.shop"], enabled: true },
  { id: "blocked", domains: ["blocked.shop"], enabled: false },
].map((m, i) => ({
  ...m,
  name: m.id,
  homeUrl: `https://${m.domains[0]}`,
  logoUrl: null,
  sortOrder: i,
}));
type Row = { id: string; url: string; seen: string; data: unknown };
// 12 products at enabled stores (pairs share an observation time, so the id tiebreak matters), plus stores the
// catalog must leave out: a disabled one, an unlisted one and a look-alike domain.
const rows: Row[] = [
  ...Array.from({ length: 12 }, (_, i) => {
    const url = `https://${i % 3 ? "www.allowed.shop" : "other.shop"}/p/${i}`;
    return {
      id: `p${String(i).padStart(2, "0")}`,
      url,
      seen: `2026-10-0${1 + Math.floor(i / 2)}T12:00:00.000000Z`,
      data: {
        url,
        title: `Product ${i}`,
        images: [],
        evidence: "worker evidence",
        offers: [{ amountMinor: 1000 + i, currency: "CAD", evidence: "x" }],
      },
    };
  }),
  ...[
    "https://blocked.shop/p",
    "https://unlisted.shop/p",
    "https://notallowed.shop/p",
  ].map((url, i) => ({
    id: `x${i}`,
    url,
    seen: "2026-10-09T00:00:00.000000Z",
    data: { url, title: "Hidden", images: [] },
  })),
];
// Stored, but no longer a valid product: kept out of the page without breaking pagination.
rows.push({
  id: "p99",
  url: "https://allowed.shop/broken",
  seen: "2026-09-30T00:00:00.000000Z",
  data: { broken: true },
});
const host = (url: string) => new URL(url).hostname;
const queries: unknown[][] = [];
// Answers the catalog page query like the SQL does: domain match, keyset cursor, newest first, limit.
function catalogPage(values: unknown[]) {
  queries.push(values);
  const [domains, ...rest] = values as [string[], ...unknown[]];
  const limit = rest.at(-1) as number;
  const after = rest.length === 3 ? { seen: rest[0], id: rest[1] } : null;
  return rows
    .filter((row) =>
      domains.some(
        (d) => host(row.url) === d || host(row.url).endsWith("." + d),
      ),
    )
    .filter(
      (row) =>
        !after ||
        row.seen < (after.seen as string) ||
        (row.seen === after.seen && row.id < (after.id as string)),
    )
    .sort((a, b) =>
      a.seen === b.seen
        ? b.id.localeCompare(a.id)
        : b.seen.localeCompare(a.seen),
    )
    .slice(0, limit)
    .map(({ id, url, seen }) => ({ id, url, seen }));
}
@Module({
  providers: [
    {
      provide: PrismaService,
      useValue: {
        $queryRaw: async (query: { sql?: string; values?: unknown[] }) => {
          const sql = String(query.sql);
          if (sql.includes("to_char")) return catalogPage(query.values ?? []);
          if (sql.includes("external_price_points")) return [];
          return rows
            .filter((row) => query.values?.includes(hash("sha256", row.url)))
            .map(({ url, data }) => ({ url, data }));
        },
        merchant: {
          findMany: async (args?: { where?: { enabled: boolean } }) =>
            args?.where ? merchants.filter((m) => m.enabled) : merchants,
        },
      },
    },
  ],
  exports: [PrismaService],
})
class TestDatabaseModule {}
const config = loadApiConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" });
@Global()
@Module({
  providers: [{ provide: apiConfig.KEY, useValue: config }],
  exports: [apiConfig.KEY],
})
class TestConfigModule {}
@Module({
  providers: [
    { provide: QueueHealthService, useValue: { check: async () => ({}) } },
  ],
  exports: [QueueHealthService],
})
class TestQueueModule {}
@Module({})
class TestSchedulingModule {}
let app: INestApplication;
let base: string;
before(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideModule(DatabaseModule)
    .useModule(TestDatabaseModule)
    .overrideModule(ApiConfigModule)
    .useModule(TestConfigModule)
    .overrideModule(QueueModule)
    .useModule(TestQueueModule)
    .overrideModule(SchedulingModule)
    .useModule(TestSchedulingModule)
    .overrideProvider(CaptureQueue)
    .useValue({})
    .compile();
  app = module.createNestApplication({ logger: false, bodyParser: false });
  configureHttp(app, config);
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
});
after(async () => app?.close());
type Page = {
  items: {
    url: string;
    product: Record<string, unknown>;
    history: unknown[];
  }[];
  nextCursor: string | null;
};
const get = (query = "") => fetch(`${base}/api/catalog/products${query}`);
const page = async (query = "") => (await (await get(query)).json()) as Page;

test("the catalog pages through every enabled store's products once, newest first, without a token", async () => {
  const urls: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const response = await get(
      `?limit=5${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as Page;
    urls.push(...body.items.map((item) => item.url));
    cursor = body.nextCursor;
    pages++;
  } while (cursor && pages < 10);
  const expected = rows
    .filter((row) => row.id.startsWith("p") && row.id !== "p99")
    .sort((a, b) =>
      a.seen === b.seen
        ? b.id.localeCompare(a.id)
        : b.seen.localeCompare(a.seen),
    )
    .map((row) => row.url);
  assert.deepEqual(urls, expected);
  // 13 rows at enabled stores: 5 + 5 + 3, the broken one counted but not shown.
  assert.equal(pages, 3);
});

test("a page carries the product and its history but no worker evidence or user data", async () => {
  const body = await page("?limit=1");
  assert.equal(body.items.length, 1);
  assert.deepEqual(Object.keys(body.items[0]!).sort(), [
    "history",
    "product",
    "url",
  ]);
  assert.equal(body.items[0]!.product.title, "Product 11");
  assert.doesNotMatch(JSON.stringify(body), /evidence|userId|token/);
  assert.equal(typeof body.nextCursor, "string");
});

test("the last page has no next cursor, and an exact-size page knows it is the last", async () => {
  const all = await page("?limit=50");
  assert.equal(all.items.length, 12);
  assert.equal(all.nextCursor, null);
  const exact = await page("?limit=13");
  assert.equal(exact.nextCursor, null);
});

test("limit defaults to 20 and is clamped to 1…50", async () => {
  for (const [query, asked] of [
    ["", 21],
    ["?limit=500", 51],
    ["?limit=0", 2],
    ["?limit=-3", 2],
  ] as const) {
    queries.length = 0;
    assert.equal((await get(query)).status, 200);
    assert.equal(queries[0]!.at(-1), asked, query);
  }
  assert.equal((await get("?limit=abc")).status, 400);
  assert.equal((await get("?limit=2.5")).status, 400);
});

test("a cursor that this API did not hand out is a 400, not a silent first page", async () => {
  for (const cursor of [
    "garbage!",
    Buffer.from("not json").toString("base64url"),
    Buffer.from(JSON.stringify({ seen: "x", id: "y" })).toString("base64url"),
    encodeCatalogCursor({ seen: "2026-13-45T99:00:00.000000Z", id: "p1" }),
    encodeCatalogCursor({ seen: "yesterday", id: "p1" }),
    encodeCatalogCursor({ seen: "2026-10-01T12:00:00.000000Z", id: "" }),
  ]) {
    const response = await get(`?cursor=${encodeURIComponent(cursor)}`);
    assert.equal(response.status, 400, cursor);
  }
  assert.equal((await get(`?cursor=${"a".repeat(201)}`)).status, 400);
  assert.equal((await get("?page=2")).status, 400);
});

test("merchant keeps one enabled store's products, matching its subdomains but not look-alikes", async () => {
  const allowed = await page("?merchant=allowed&limit=50");
  assert.equal(allowed.items.length, 8);
  assert.ok(
    allowed.items.every((item) => host(item.url) === "www.allowed.shop"),
  );
  const other = await page("?merchant=other");
  assert.equal(other.items.length, 4);
  for (const merchant of ["quiet", "blocked", "unknown"])
    assert.deepEqual(await page(`?merchant=${merchant}`), {
      items: [],
      nextCursor: null,
    });
  assert.equal((await get("?merchant=bad%20id")).status, 400);
});
