import { DatabaseModule } from "../src/core/database/database.module.ts";
import { PrismaService } from "../src/core/database/services/prisma.service.ts";
import "reflect-metadata";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  Global,
  Module,
  ServiceUnavailableException,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module.ts";
import { ApiConfigModule } from "../src/core/config/config.module.ts";
import {
  apiConfig,
  loadApiConfig,
} from "../src/core/config/schema/config.schema.ts";
import { QueueModule } from "../src/core/queue/queue.module.ts";
import { SchedulingModule } from "../src/core/scheduling/scheduling.module.ts";
import { QueueHealthService } from "../src/core/queue/services/queue-health.service.ts";
import {
  CaptureQueue,
  type CaptureState,
} from "../src/feature/products/providers/capture.queue.ts";
import { configureHttp } from "../src/core/server/http/configure-app.ts";
import type { CrawlTaskInput } from "@morydeals/capture-contracts";

const merchants = [
  {
    id: "disabled",
    name: "Disabled",
    homeUrl: "https://blocked.shop",
    logoUrl: null,
    domains: ["blocked.shop"],
    enabled: false,
    sortOrder: 1,
  },
  {
    id: "allowed",
    name: "Allowed",
    homeUrl: "https://allowed.shop",
    logoUrl: null,
    domains: ["allowed.shop"],
    enabled: true,
    sortOrder: 2,
  },
];
const users = new Map<string, string>();
type CartRow = { userId: string; productUrl: string; addedAt: Date };
const cart = new Map<string, CartRow>();
const viewed = new Map<
  string,
  { userId: string; productUrl: string; viewedAt: Date }
>();
type ListRow = {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};
type ListItemRow = { listId: string; productUrl: string; addedAt: Date };
const lists = new Map<string, ListRow>();
const listItems = new Map<string, ListItemRow>();
let listClock = 0;
// Distinct, increasing times so ordering by date is deterministic.
const tick = () => new Date(Date.UTC(2026, 9, 10) + ++listClock * 1000);
const itemsOf = (listId: string) =>
  [...listItems.values()]
    .filter((item) => item.listId === listId)
    .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
const withItems = (list: ListRow) => ({ ...list, items: itemsOf(list.id) });
const tracked = [
  {
    url: "https://shop.com/a",
    data: {
      url: "https://shop.com/a",
      title: "Product",
      images: [],
      evidence: "worker evidence",
      offers: [{ amountMinor: 1234, currency: "CAD", evidence: "secret" }],
    },
  },
];
// Pages a product was captured from, and when that product was last observed (by any capture).
const knownPages = [
  {
    pageUrl: "https://shop.com/a?ref=home",
    productUrl: "https://shop.com/a",
    observedAt: new Date(),
  },
  {
    pageUrl: "https://shop.com/a?ref=old",
    productUrl: "https://shop.com/a",
    observedAt: new Date(Date.now() - 13 * 3600_000),
  },
];
const historyRows = [
  {
    url: "https://shop.com/a",
    at: new Date("2026-08-01T00:00:00Z"),
    amount: 1500n,
  },
  {
    url: "https://shop.com/a",
    at: new Date("2026-09-01T00:00:00Z"),
    amount: null,
  },
  {
    url: "https://shop.com/a",
    at: new Date("2026-10-01T00:00:00Z"),
    amount: 1234n,
  },
];
@Module({
  providers: [
    {
      provide: PrismaService,
      useValue: {
        anonymousUser: {
          create: async ({
            data,
          }: {
            data: { id: string; tokenHash: string };
          }) => {
            users.set(data.tokenHash, data.id);
            return data;
          },
          findUnique: async ({ where }: { where: { tokenHash: string } }) =>
            users.has(where.tokenHash)
              ? { id: users.get(where.tokenHash) }
              : null,
        },
        cartItem: {
          upsert: async ({ create }: { create: Omit<CartRow, "addedAt"> }) => {
            const key = `${create.userId} ${create.productUrl}`;
            if (!cart.has(key))
              cart.set(key, { ...create, addedAt: new Date() });
          },
          deleteMany: async ({
            where,
          }: {
            where: Omit<CartRow, "addedAt">;
          }) => {
            cart.delete(`${where.userId} ${where.productUrl}`);
          },
          findMany: async ({ where }: { where: { userId: string } }) =>
            [...cart.values()].filter((item) => item.userId === where.userId),
        },
        viewedItem: {
          upsert: async ({
            create,
          }: {
            create: { userId: string; productUrl: string; viewedAt: Date };
          }) => {
            viewed.set(`${create.userId} ${create.productUrl}`, create);
          },
          findMany: async ({ where }: { where: { userId: string } }) =>
            [...viewed.values()].filter((item) => item.userId === where.userId),
        },
        shoppingList: {
          count: async ({ where }: { where: { userId: string } }) =>
            [...lists.values()].filter((l) => l.userId === where.userId).length,
          create: async ({
            data,
          }: {
            data: {
              userId: string;
              name: string;
              items?: { create: { productUrl: string }[] };
            };
          }) => {
            const at = tick();
            const row = {
              id: crypto.randomUUID(),
              userId: data.userId,
              name: data.name,
              createdAt: at,
              updatedAt: at,
            };
            lists.set(row.id, row);
            for (const item of data.items?.create ?? [])
              listItems.set(`${row.id} ${item.productUrl}`, {
                listId: row.id,
                productUrl: item.productUrl,
                addedAt: tick(),
              });
            return withItems(row);
          },
          findMany: async ({ where }: { where: { userId: string } }) =>
            [...lists.values()]
              .filter((l) => l.userId === where.userId)
              .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
              .map(withItems),
          findFirst: async ({
            where,
          }: {
            where: { id: string; userId: string };
          }) => {
            const row = lists.get(where.id);
            return row && row.userId === where.userId ? withItems(row) : null;
          },
          updateMany: async ({
            where,
            data,
          }: {
            where: { id: string; userId: string };
            data: { name?: string; updatedAt?: Date };
          }) => {
            const row = lists.get(where.id);
            if (!row || row.userId !== where.userId) return { count: 0 };
            lists.set(row.id, { ...row, ...data, updatedAt: tick() });
            return { count: 1 };
          },
          deleteMany: async ({
            where,
          }: {
            where: { id: string; userId: string };
          }) => {
            const row = lists.get(where.id);
            if (!row || row.userId !== where.userId) return { count: 0 };
            lists.delete(row.id);
            for (const key of [...listItems.keys()])
              if (key.startsWith(`${row.id} `)) listItems.delete(key);
            return { count: 1 };
          },
        },
        shoppingListItem: {
          count: async ({ where }: { where: { listId: string } }) =>
            itemsOf(where.listId).length,
          upsert: async ({
            create,
          }: {
            create: { listId: string; productUrl: string };
          }) => {
            const key = `${create.listId} ${create.productUrl}`;
            if (!listItems.has(key))
              listItems.set(key, { ...create, addedAt: tick() });
          },
          deleteMany: async ({
            where,
          }: {
            where: { listId: string; productUrl: string };
          }) => {
            listItems.delete(`${where.listId} ${where.productUrl}`);
          },
        },
        $queryRaw: async (query: { sql?: string; values?: unknown[] }) =>
          String(query.sql).includes("crawler_runs")
            ? knownPages
                .filter(
                  (page) =>
                    page.pageUrl === query.values?.[0] &&
                    page.observedAt > (query.values?.[1] as Date),
                )
                .map((page) => ({ url: page.productUrl }))
            : String(query.sql).includes("external_price_points")
              ? historyRows
              : tracked,
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
let current: CaptureState | null = { state: "pending" };
let submitted: CrawlTaskInput | undefined;
let unavailable = false;
const config = loadApiConfig({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  API_PROXY_PROFILE: "test-pool",
  API_DIRECT_HOSTS: "bestbuy.ca,www.bestbuy.ca",
});
const queue = {
  submit: async (input: CrawlTaskInput) => {
    submitted = input;
    return "shared-job";
  },
  find: async () => {
    if (unavailable)
      throw new ServiceUnavailableException("secret upstream address");
    return current;
  },
  check: async () =>
    unavailable
      ? { redis: { status: "down" as const } }
      : { redis: { status: "up" as const } },
};
@Global()
@Module({
  providers: [{ provide: apiConfig.KEY, useValue: config }],
  exports: [apiConfig.KEY],
})
class TestConfigModule {}
@Module({
  providers: [{ provide: QueueHealthService, useValue: queue }],
  exports: [QueueHealthService],
})
class TestCaptureModule {}
@Module({})
class TestSchedulingModule {}
let app: INestApplication;
let base: string;
let authorization: string;
const register = async () =>
  `Bearer ${(await (await fetch(base + "/api/anonymous-users", { method: "POST" })).json()).token}`;
before(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideModule(DatabaseModule)
    .useModule(TestDatabaseModule)
    .overrideModule(ApiConfigModule)
    .useModule(TestConfigModule)
    .overrideModule(QueueModule)
    .useModule(TestCaptureModule)
    // Recurring jobs need Redis; they are tested on their own (scheduling.test.ts).
    .overrideModule(SchedulingModule)
    .useModule(TestSchedulingModule)
    .overrideProvider(CaptureQueue)
    .useValue(queue)
    .compile();
  app = module.createNestApplication({ logger: false, bodyParser: false });
  configureHttp(app, config);
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  authorization = await register();
});
after(async () => app?.close());
test("HTTP validation runs before queue and does not accept caller crawl options", async () => {
  for (const body of [
    { url: "invalid" },
    { url: "file:///tmp/a" },
    { url: "https://user:pass@shop.com/a" },
    { url: "https://shop.com/a", context: {} },
  ]) {
    const response = await fetch(base + "/api/products", {
      method: "POST",
      headers: { "content-type": "application/json", authorization },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    assert.ok(response.headers.get("x-request-id"));
  }
  assert.equal(submitted, undefined);
  const response = await fetch(base + "/api/products", {
    method: "POST",
    headers: { "content-type": "application/json", authorization },
    body: JSON.stringify({ url: " https://shop.com/a?variant=123 " }),
  });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {
    id: "shared-job",
    status: "pending",
  });
  assert.equal(
    (submitted as CrawlTaskInput | undefined)?.url,
    "https://shop.com/a?variant=123",
  );
});
test("HTTP result mapping strips evidence and handles all terminal states", async () => {
  const get = () =>
    fetch(base + "/api/products/shared-job", { headers: { authorization } });
  current = {
    state: "completed",
    result: {
      status: "parsed",
      auditId: "secret",
      parsed: {
        products: [
          {
            url: "https://shop.com/a",
            title: "Product",
            images: [],
            offers: [
              { amountMinor: 1234, currency: "CAD", evidence: "secret" },
            ],
          },
        ],
      },
    },
  };
  const response = await get();
  assert.equal(response.status, 200);
  const ready = await response.json();
  assert.equal(ready.status, "ready");
  assert.equal(JSON.stringify(ready).includes("secret"), false);
  // A confirmed capture is added to the polling user's cart.
  const carted = await (
    await fetch(base + "/api/cart", { headers: { authorization } })
  ).json();
  assert.deepEqual(
    carted.items.map((item: { url: string }) => item.url),
    ["https://shop.com/a"],
  );
  current = {
    state: "completed",
    result: { status: "parsed", parsed: { products: [] } },
  };
  assert.equal((await (await get()).json()).status, "failed");
  current = { state: "failed", failureCode: "incomplete" };
  assert.match((await (await get()).json()).message, /even after loading/);
  current = { state: "failed", failureCode: "blocked" };
  assert.match((await (await get()).json()).message, /blocked automated/);
  current = { state: "failed" };
  assert.equal((await (await get()).json()).status, "failed");
  current = { state: "pending" };
  assert.equal((await (await get()).json()).status, "pending");
  current = null;
  assert.equal((await get()).status, 404);
  unavailable = true;
  const failure = await get();
  assert.equal(failure.status, 503);
  assert.equal((await failure.text()).includes("secret"), false);
  unavailable = false;
});
test("readiness depends on Redis; liveness does not", async () => {
  assert.equal((await fetch(base + "/api/health/ready")).status, 200);
  unavailable = true;
  assert.equal((await fetch(base + "/api/health/ready")).status, 503);
  assert.equal((await fetch(base + "/api/health/live")).status, 200);
  unavailable = false;
});
test("configuration rejects invalid ports, protocols and unsafe origin configuration without echoing credentials", () => {
  for (const env of [
    { API_PORT: "0" },
    { REDIS_URL: "https://secret:password@host" },
    { API_CORS_ORIGINS: "*" },
    { NODE_ENV: "production" },
  ])
    assert.throws(
      () => loadApiConfig(env),
      (error) => error instanceof Error && !error.message.includes("password"),
    );
});

test("merchant listing excludes disabled stores and admission cannot be bypassed by Others", async () => {
  const catalog = await (await fetch(base + "/api/merchants")).json();
  assert.equal(catalog.allowOthers, true);
  assert.deepEqual(
    catalog.merchants.map((m: { id: string }) => m.id),
    ["allowed"],
  );
  assert.equal("enabled" in catalog.merchants[0], false);
  const post = (url: string) =>
    fetch(base + "/api/products", {
      method: "POST",
      headers: { "content-type": "application/json", authorization },
      body: JSON.stringify({ url }),
    });
  assert.equal((await post("https://blocked.shop/item")).status, 403);
  assert.equal((await post("https://www.blocked.shop/item")).status, 403);
  assert.equal((await post("https://blocked.shop./item")).status, 403);
  config.allowOtherMerchants = false;
  try {
    assert.equal((await post("https://unknown.shop/item")).status, 403);
    assert.equal(
      (await post("https://allowed.shop.evil.test/item")).status,
      403,
    );
    assert.equal(
      (await post("https://www.allowed.shop/item?variant=123")).status,
      202,
    );
    assert.equal(submitted?.url, "https://www.allowed.shop/item?variant=123");
  } finally {
    config.allowOtherMerchants = true;
  }
});

test("API selects direct egress only for configured exact hosts", async () => {
  for (const [host, direct] of [
    ["www.bestbuy.ca", true],
    ["bestbuy.ca", true],
    ["other.bestbuy.ca", false],
    ["bestbuy.ca.example.com", false],
    ["walmart.ca", false],
  ] as const) {
    const response = await fetch(base + "/api/products", {
      method: "POST",
      headers: { "content-type": "application/json", authorization },
      body: JSON.stringify({ url: `https://${host}/product/123` }),
    });
    assert.equal(response.status, 202);
    assert.deepEqual(
      submitted?.context && "network" in submitted.context
        ? submitted.context.network
        : undefined,
      direct ? undefined : { proxyProfile: "test-pool", rotation: "session" },
    );
  }
});

test("snapshot endpoint validates input and merchant admission before enqueue", async () => {
  for (const [body, status] of [
    [{ url: "https://shop.com/a", html: "x" }, 400],
    [
      {
        url: "https://blocked.shop/a",
        html: "<h1>x</h1>",
        capturedAt: new Date().toISOString(),
      },
      403,
    ],
    [
      {
        url: "https://shop.com/a",
        html: "<h1>x</h1>",
        capturedAt: new Date().toISOString(),
        clientResult: { status: "parsed", products: [] },
      },
      400,
    ],
  ] as const) {
    const response = await fetch(base + "/api/products/snapshots", {
      method: "POST",
      headers: { "content-type": "application/json", authorization },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, status);
  }
});

test("capture and cart routes require this device's token", async () => {
  const attempts: Record<string, string>[] = [
    {},
    { authorization: "Bearer " + "x".repeat(43) },
    { authorization: "Basic abc" },
  ];
  for (const headers of attempts) {
    assert.equal(
      (await fetch(base + "/api/products/shared-job", { headers })).status,
      401,
    );
    assert.equal((await fetch(base + "/api/cart", { headers })).status, 401);
  }
  assert.equal((await fetch(base + "/api/merchants")).status, 200);
});

test("the cart is per device, returns stored product data without evidence, and removes items", async () => {
  const mine = await register();
  const other = await register();
  assert.notEqual(mine, other);
  const put = (auth: string, url: string) =>
    fetch(base + "/api/cart/items", {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: auth },
      body: JSON.stringify({ url }),
    });
  assert.equal((await put(mine, "https://shop.com/a")).status, 204);
  assert.equal((await put(mine, "https://shop.com/a")).status, 204);
  assert.equal((await put(mine, "https://shop.com/unknown")).status, 204);
  assert.equal((await put(mine, "file:///etc/passwd")).status, 400);
  const list = async (auth: string) =>
    (
      await (
        await fetch(base + "/api/cart", { headers: { authorization: auth } })
      ).json()
    ).items;
  const items = await list(mine);
  assert.equal(items.length, 2);
  const stored = items.find(
    (item: { url: string }) => item.url === "https://shop.com/a",
  );
  assert.equal(stored.product.offers[0].amountMinor, 1234);
  assert.deepEqual(stored.history, [
    { at: "2026-08-01T00:00:00.000Z", amountMinor: 1500 },
    { at: "2026-09-01T00:00:00.000Z", amountMinor: null },
    { at: "2026-10-01T00:00:00.000Z", amountMinor: 1234 },
  ]);
  assert.deepEqual(
    items.find((item: { url: string }) => item.url.endsWith("unknown")).history,
    [],
  );
  assert.equal(JSON.stringify(items).includes("evidence"), false);
  assert.equal(
    items.find((item: { url: string }) => item.url.endsWith("unknown")).product,
    null,
  );
  assert.deepEqual(await list(other), []);
  const remove = await fetch(
    base +
      "/api/cart/items?url=" +
      encodeURIComponent("https://shop.com/unknown"),
    { method: "DELETE", headers: { authorization: mine } },
  );
  assert.equal(remove.status, 204);
  assert.deepEqual(
    (await list(mine)).map((item: { url: string }) => item.url),
    ["https://shop.com/a"],
  );
});

test("page uploads accept real store pages larger than the default JSON limit", async () => {
  // A slimmed store page is commonly a few hundred kilobytes.
  const html = `<h1>Mug</h1>${"x".repeat(600_000)}`;
  for (const path of ["/api/products/snapshots", "/api/pages"]) {
    const response = await fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json", authorization },
      body: JSON.stringify({
        url: "https://shop.com/a",
        html,
        capturedAt: new Date().toISOString(),
      }),
    });
    assert.equal(response.status, 202, path);
  }
});

test("automatic visits are classified by the worker; product pages go to history, never the cart", async () => {
  const device = await register();
  const html = "<h1>Mug</h1>";
  const response = await fetch(base + "/api/pages", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: device },
    body: JSON.stringify({
      url: "https://shop.com/a",
      html,
      capturedAt: new Date().toISOString(),
    }),
  });
  assert.equal(response.status, 202);
  assert.equal(submitted?.intent, "browse");
  const visit = async () =>
    (
      await fetch(base + "/api/pages/shared-job", {
        headers: { authorization: device },
      })
    ).json();
  const classification = (productProbability: number, readiness = "ready") => ({
    source: "model",
    provider: "jev",
    probabilities: {
      product: productProbability,
      listing: 1 - productProbability,
      home: 0,
      cart_or_checkout: 0,
      account: 0,
      article: 0,
      other: 0,
    },
    productProbability,
    readiness,
  });
  current = {
    state: "completed",
    result: { status: "not_product", classification: classification(0.3) },
  };
  assert.deepEqual(await visit(), {
    id: "shared-job",
    status: "not_product",
    productProbability: 0.3,
  });
  // A product page still waiting for the shopper's size or configuration choice.
  current = {
    state: "completed",
    result: {
      status: "needs_selection",
      classification: classification(0.95, "needs_selection"),
    },
  };
  assert.deepEqual(await visit(), {
    id: "shared-job",
    status: "needs_selection",
    productProbability: 0.95,
  });
  // A product page read before it rendered is read again, as an unconfirmed product is.
  current = {
    state: "completed",
    result: {
      status: "not_loaded",
      classification: classification(0.95, "not_loaded"),
    },
  };
  assert.deepEqual(await visit(), {
    id: "shared-job",
    status: "unconfirmed",
    productProbability: 0.95,
  });
  current = {
    state: "completed",
    result: {
      status: "needs_review",
      parsed: { products: [] },
      classification: classification(0.9),
    },
  };
  assert.equal((await visit()).status, "unconfirmed");
  current = {
    state: "completed",
    result: {
      status: "parsed",
      classification: classification(0.9),
      parsed: {
        products: [
          {
            url: "https://shop.com/a",
            title: "Mug",
            images: [],
            offers: [{ amountMinor: 1899, currency: "CAD" }],
          },
        ],
      },
    },
  };
  const found = await visit();
  assert.equal(found.status, "product");
  assert.equal(found.productProbability, 0.9);
  assert.equal(found.product.offers[0].amountMinor, 1899);
  // The strip's product page shows its price history, as the cart does.
  assert.ok(Array.isArray(found.history));
  const history = await (
    await fetch(base + "/api/history", { headers: { authorization: device } })
  ).json();
  assert.deepEqual(
    history.items.map((item: { url: string }) => item.url),
    ["https://shop.com/a"],
  );
  const carted = await (
    await fetch(base + "/api/cart", { headers: { authorization: device } })
  ).json();
  assert.deepEqual(carted.items, []);
  current = { state: "pending" };
});

test("a page whose product was observed in the last 12 hours is answered without a new capture", async () => {
  const device = await register();
  const known = async (url: string) =>
    fetch(base + "/api/pages/known", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: device },
      body: JSON.stringify({ url }),
    });
  submitted = undefined;
  const fresh = await known("https://shop.com/a?ref=home");
  assert.equal(fresh.status, 200);
  const found = await fresh.json();
  assert.equal(found.status, "product");
  assert.equal(found.product.url, "https://shop.com/a");
  assert.equal(found.product.offers[0].evidence, undefined);
  assert.ok(Array.isArray(found.history));
  // Nothing was queued, and the product is in this device's history.
  assert.equal(submitted, undefined);
  const history = await (
    await fetch(base + "/api/history", { headers: { authorization: device } })
  ).json();
  assert.deepEqual(
    history.items.map((item: { url: string }) => item.url),
    ["https://shop.com/a"],
  );
  // Older than 12 hours, or never captured from this page: the app captures it.
  for (const url of ["https://shop.com/a?ref=old", "https://shop.com/never"])
    assert.deepEqual(await (await known(url)).json(), { status: "unknown" });
  assert.equal((await known("https://blocked.shop/a")).status, 403);
  assert.equal((await known("not a url")).status, 400);
});

test("lists: create with a product, overview with covers and membership, detail with product data", async () => {
  const device = await register();
  const call = (path: string, init: RequestInit = {}) =>
    fetch(base + "/api/lists" + path, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: device,
        ...(init.headers ?? {}),
      },
    });
  // Creating with a product puts it in the new list.
  const created = await call("", {
    method: "POST",
    body: JSON.stringify({ name: "  Kitchen ", url: "https://shop.com/a" }),
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  await call("", { method: "POST", body: JSON.stringify({ name: "Gifts" }) });
  const overview = await (
    await call("?url=" + encodeURIComponent("https://shop.com/a"))
  ).json();
  assert.deepEqual(
    overview.lists.map(
      (l: { name: string; itemCount: number; contains: boolean }) => [
        l.name,
        l.itemCount,
        l.contains,
      ],
    ),
    [
      ["Kitchen", 1, true],
      ["Gifts", 0, false],
    ],
  );
  assert.equal(Array.isArray(overview.lists[0].covers), true);
  const detail = await (await call(`/${id}`)).json();
  assert.equal(detail.name, "Kitchen");
  assert.equal(detail.items[0].url, "https://shop.com/a");
  assert.equal(detail.items[0].product.title, "Product");
  // Worker evidence never leaves the API.
  assert.equal(JSON.stringify(detail).includes("secret"), false);
});

test("lists: add, remove, rename and delete; another device cannot touch them", async () => {
  const device = await register();
  const other = await register();
  const call = (path: string, init: RequestInit = {}, who = device) =>
    fetch(base + "/api/lists" + path, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: who,
        ...(init.headers ?? {}),
      },
    });
  const { id } = await (
    await call("", { method: "POST", body: JSON.stringify({ name: "Desk" }) })
  ).json();
  const url = "https://shop.com/a";
  assert.equal(
    (
      await call(`/${id}/items`, {
        method: "PUT",
        body: JSON.stringify({ url }),
      })
    ).status,
    204,
  );
  assert.equal((await (await call(`/${id}`)).json()).items.length, 1);
  assert.equal(
    (
      await call(`/${id}/items?url=${encodeURIComponent(url)}`, {
        method: "DELETE",
      })
    ).status,
    204,
  );
  assert.equal((await (await call(`/${id}`)).json()).items.length, 0);
  assert.equal(
    (
      await call(`/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Office" }),
      })
    ).status,
    204,
  );
  assert.equal((await (await call(`/${id}`)).json()).name, "Office");
  // Someone else's list does not exist for them.
  for (const [path, init] of [
    [`/${id}`, {}],
    [`/${id}`, { method: "PATCH", body: JSON.stringify({ name: "Mine" }) }],
    [`/${id}/items`, { method: "PUT", body: JSON.stringify({ url }) }],
    [`/${id}`, { method: "DELETE" }],
  ] as const)
    assert.equal(
      (await call(path, init, other)).status,
      404,
      `${init.method ?? "GET"} ${path}`,
    );
  assert.equal((await call(`/${id}`, { method: "DELETE" })).status, 204);
  assert.equal((await call(`/${id}`)).status, 404);
});

test("lists: names are 1 to 60 characters; at most 20 lists and 200 products each", async () => {
  const device = await register();
  const call = (path: string, init: RequestInit = {}) =>
    fetch(base + "/api/lists" + path, {
      ...init,
      headers: { "content-type": "application/json", authorization: device },
    });
  for (const name of ["", "   ", "x".repeat(61)])
    assert.equal(
      (await call("", { method: "POST", body: JSON.stringify({ name }) }))
        .status,
      400,
      JSON.stringify(name),
    );
  let first = "";
  for (let n = 0; n < 20; n++) {
    const response = await call("", {
      method: "POST",
      body: JSON.stringify({ name: `List ${n}` }),
    });
    assert.equal(response.status, 201);
    if (!n) first = (await response.json()).id;
  }
  const over = await call("", {
    method: "POST",
    body: JSON.stringify({ name: "One more" }),
  });
  assert.equal(over.status, 409);
  assert.match((await over.json()).message, /20 lists/);
  for (let n = 0; n < 200; n++)
    listItems.set(`${first} https://shop.com/p${n}`, {
      listId: first,
      productUrl: `https://shop.com/p${n}`,
      addedAt: tick(),
    });
  const full = await call(`/${first}/items`, {
    method: "PUT",
    body: JSON.stringify({ url: "https://shop.com/a" }),
  });
  assert.equal(full.status, 409);
  assert.match((await full.json()).message, /200 products/);
});
