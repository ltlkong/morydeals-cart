import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Test } from "@nestjs/testing";
import { LocalStorageProvider } from "../src/core/storage/providers/local/local-storage.provider.ts";
import { LocalStorageController } from "../src/core/storage/providers/local/local-storage.controller.ts";
import { STORAGE_PROVIDER } from "../src/core/storage/providers/storage-provider.ts";
import { StorageService } from "../src/core/storage/services/storage.service.ts";
import type {
  StorageRepository,
  StorageObject,
} from "../src/core/storage/persistence/storage.repository.ts";

test("local signed HTTP streams exact JSON bytes and rejects tampering, wrong type and expiry", async () => {
  const root = await mkdtemp(join(tmpdir(), "mory-storage-"));
  const provider = new LocalStorageProvider(
    root,
    "a".repeat(32),
    "http://localhost",
  );
  const module = await Test.createTestingModule({
    controllers: [LocalStorageController],
    providers: [{ provide: STORAGE_PROVIDER, useValue: provider }],
  }).compile();
  const app = module.createNestApplication({
    logger: false,
    bodyParser: false,
  });
  app.setGlobalPrefix("api");
  await app.listen(0, "127.0.0.1");
  try {
    const key = `fixtures/${randomUUID()}`;
    const body = Buffer.from('{ "hello": "storage" }\n');
    const upload = await provider.createUpload(
      key,
      "application/json",
      body.length,
      60,
    );
    const url = (await app.getUrl()) + new URL(upload.url).pathname;
    const res = await fetch(url, {
      method: "PUT",
      headers: upload.headers,
      body,
    });
    assert.equal(res.status, 204);
    assert.deepEqual(Buffer.from(await provider.read(key)), body);
    const download = await provider.downloadUrl(key, "private", 60);
    const get = await fetch((await app.getUrl()) + new URL(download).pathname);
    assert.equal(get.status, 200);
    assert.equal(await get.text(), body.toString());
    assert.equal(
      (
        await fetch(url + "tampered", {
          method: "PUT",
          headers: upload.headers,
          body,
        })
      ).status,
      400,
    );
    const token = decodeURIComponent(
      new URL(upload.url).pathname.split("/").at(-1)!,
    );
    assert.throws(
      () => provider.verify(token, "put", Date.now() + 120000),
      /token_expired/,
    );
    await assert.rejects(
      provider.receive(token, "image/png", Readable.from(body)),
      /content_type_mismatch/,
    );
    await provider.delete(key);
    assert.equal(await provider.head(key), null);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("storage lifecycle enforces policy, owner, purpose and status before returning objects", async () => {
  const root = await mkdtemp(join(tmpdir(), "mory-storage-service-"));
  const provider = new LocalStorageProvider(
    root,
    "b".repeat(32),
    "http://localhost",
  );
  const rows = new Map<string, StorageObject>();
  const repository = {
    insert: async (input: Omit<StorageObject, "createdAt">) => {
      const row = { ...input, createdAt: new Date() };
      rows.set(row.id, row);
      return row;
    },
    find: async (ids: string[]) =>
      ids.flatMap((id) => (rows.has(id) ? [rows.get(id)!] : [])),
    transition: async (
      id: string,
      from: string,
      to: StorageObject["status"],
    ) => {
      const row = rows.get(id);
      if (row?.status !== from) return undefined;
      const next = { ...row, status: to };
      rows.set(id, next);
      return next;
    },
    expiredPending: async () => [],
  } as unknown as StorageRepository;
  const service = new StorageService(provider, repository);
  const policy = {
    purpose: "merchant_logos",
    contentTypes: ["image/png"],
    maxBytes: 100,
    visibility: "public" as const,
  };
  try {
    await assert.rejects(
      service.put(policy, Buffer.from("abc"), "text/html", "owner"),
      /unsupported_content_type/,
    );
    const { object } = await service.createUpload(policy, {
      contentType: "image/png",
      sizeBytes: 3,
      ownerId: "owner",
    });
    await assert.rejects(
      service.complete(object.id, "other"),
      /not_object_owner/,
    );
    await assert.rejects(
      service.claim([object.id], "owner", policy.purpose),
      /invalid_storage_objects/,
    );
    await provider.put(object.key, Buffer.from("abc"), "image/png");
    assert.equal((await service.complete(object.id, "owner")).status, "ready");
    assert.equal(
      (await service.claim([object.id], "owner", policy.purpose)).length,
      1,
    );
    assert.equal((await service.urlsFor([object.id])).size, 1);
    await assert.rejects(
      service.delete(object.id, { userId: "other", admin: false }),
      /not_object_owner/,
    );
    await service.delete(object.id, { userId: "owner", admin: false });
    assert.equal((await service.urlsFor([object.id])).size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("R2 presigning binds upload type/size and distinguishes public/private downloads", async () => {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const { R2StorageProvider } =
    await import("../src/core/storage/providers/r2/r2-storage.provider.ts");
  const s3 = new S3Client({
    region: "auto",
    endpoint: "https://fixture.r2.cloudflarestorage.com",
    forcePathStyle: true,
    credentials: { accessKeyId: "fixture", secretAccessKey: "fixture" },
  });
  try {
    const provider = new R2StorageProvider(
      s3,
      "media",
      "https://media.example",
    );
    const upload = await provider.createUpload(
      "image/item",
      "image/png",
      123,
      60,
    );
    const signed = new URL(upload.url);
    assert.equal(signed.searchParams.get("X-Amz-Expires"), "60");
    assert.ok(
      signed.searchParams
        .get("X-Amz-SignedHeaders")
        ?.includes("content-length"),
    );
    assert.ok(
      signed.searchParams.get("X-Amz-SignedHeaders")?.includes("content-type"),
    );
    assert.equal(
      await provider.downloadUrl("image/a b", "public", 60),
      "https://media.example/image/a%20b",
    );
    assert.ok(
      new URL(
        await provider.downloadUrl("image/private", "private", 60),
      ).searchParams.has("X-Amz-Signature"),
    );
  } finally {
    s3.destroy();
  }
});

test("a download aborted at any stage releases its file", async () => {
  const root = await mkdtemp(join(tmpdir(), "mory-storage-"));
  const provider = new LocalStorageProvider(
    root,
    "a".repeat(32),
    "http://localhost",
  );
  const module = await Test.createTestingModule({
    controllers: [LocalStorageController],
    providers: [{ provide: STORAGE_PROVIDER, useValue: provider }],
  }).compile();
  const app = module.createNestApplication({
    logger: false,
    bodyParser: false,
  });
  app.setGlobalPrefix("api");
  await app.listen(0, "127.0.0.1");
  // Descriptors this process holds on stored files (sockets and other files are not counted).
  const openFiles = () =>
    execFileSync("lsof", ["-p", String(process.pid)], { encoding: "utf8" })
      .split("\n")
      .filter((line) => line.includes(root)).length;
  try {
    const key = `fixtures/${randomUUID()}`;
    // Large enough that the transfer is still running when the client goes away.
    const body = Buffer.alloc(4 * 1024 * 1024, 7);
    const upload = await provider.createUpload(
      key,
      "application/octet-stream",
      body.length,
      60,
    );
    await fetch((await app.getUrl()) + new URL(upload.url).pathname, {
      method: "PUT",
      headers: upload.headers,
      body,
    });
    const download =
      (await app.getUrl()) +
      new URL(await provider.downloadUrl(key, "private", 60)).pathname;
    const before = openFiles();
    // Aborted at every stage: before the response starts, and after its headers arrive.
    for (const delay of [0, 1, 2, 5, 10, 20, 40]) {
      const abort = new AbortController();
      const request = fetch(download, { signal: abort.signal }).catch(
        () => null,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      abort.abort();
      await request;
    }
    // Give the server a moment to notice the closed sockets.
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(openFiles(), before, "an aborted download left its file open");
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
