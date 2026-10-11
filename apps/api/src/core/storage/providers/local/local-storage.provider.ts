import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  access,
  constants,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
  StorageProvider,
  StoredObjectInfo,
  UploadTarget,
  Visibility,
} from "../storage-provider.ts";

const KEY = /^[a-z][a-z0-9_]*\/[0-9a-f-]{36}$/;

export type LocalGrant = {
  key: string;
  op: "put" | "get";
  contentType?: string;
  sizeBytes?: number;
  exp: number | null;
};

export class LocalStorageError extends Error {
  constructor(
    readonly code:
      | "invalid_token"
      | "token_expired"
      | "content_type_mismatch"
      | "size_mismatch"
      | "not_found",
  ) {
    super(code);
  }
}

/**
 * Development storage on the local filesystem. Upload/download URLs point at the backend
 * (LocalStorageController) and carry an HMAC-signed grant instead of an S3 presignature.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local" as const;

  constructor(
    private readonly root: string,
    private readonly secret: string,
    private readonly publicApiUrl: string,
  ) {}

  private path(key: string) {
    if (!KEY.test(key)) throw new LocalStorageError("invalid_token");
    return join(this.root, key);
  }

  private sign(payload: string) {
    return createHmac("sha256", this.secret)
      .update(payload)
      .digest("base64url");
  }

  token(grant: LocalGrant): string {
    const payload = Buffer.from(JSON.stringify(grant)).toString("base64url");
    return `${payload}.${this.sign(payload)}`;
  }

  verify(token: string, op: LocalGrant["op"], now = Date.now()): LocalGrant {
    const [payload = "", signature = ""] = token.split(".");
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new LocalStorageError("invalid_token");
    const grant = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as LocalGrant;
    if (grant.op !== op || !KEY.test(grant.key))
      throw new LocalStorageError("invalid_token");
    if (grant.exp !== null && grant.exp < now)
      throw new LocalStorageError("token_expired");
    return grant;
  }

  private url(token: string) {
    return `${this.publicApiUrl.replace(/\/$/, "")}/api/storage/local/${token}`;
  }

  createUpload(
    key: string,
    contentType: string,
    sizeBytes: number,
    expiresInSeconds: number,
  ): Promise<UploadTarget> {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const token = this.token({
      key,
      op: "put",
      contentType,
      sizeBytes,
      exp: expiresAt.getTime(),
    });
    return Promise.resolve({
      url: this.url(token),
      method: "PUT",
      headers: { "Content-Type": contentType },
      expiresAt,
    });
  }

  /** Streams an upload for a verified grant; bytes land atomically only if type and size match exactly. */
  async receive(
    token: string,
    contentType: string | undefined,
    body: Readable,
  ): Promise<void> {
    const grant = this.verify(token, "put");
    if (contentType?.split(";")[0]?.trim() !== grant.contentType)
      throw new LocalStorageError("content_type_mismatch");
    const path = this.path(grant.key);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.upload`;
    let received = 0;
    const limit = grant.sizeBytes ?? 0;
    // The file is opened (and so exists) before anything is streamed: a stream that opens it lazily can still be creating
    // it when a rejected upload's cleanup has already run, which left an orphan temporary file behind.
    const file = await open(temporary, "wx");
    try {
      await pipeline(
        body,
        async function* (source: AsyncIterable<Buffer>) {
          for await (const chunk of source) {
            received += chunk.length;
            if (received > limit) throw new LocalStorageError("size_mismatch");
            yield chunk;
          }
        },
        file.createWriteStream(),
      );
      if (received !== limit) throw new LocalStorageError("size_mismatch");
      await writeFile(
        `${path}.meta.json`,
        JSON.stringify({ contentType: grant.contentType }),
      );
      await rename(temporary, path);
    } finally {
      await file.close().catch(() => undefined);
      await rm(temporary, { force: true });
    }
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(`${path}.meta.json`, JSON.stringify({ contentType }));
    await writeFile(path, body);
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    const path = this.path(key);
    try {
      const [info, meta] = await Promise.all([
        stat(path),
        readFile(`${path}.meta.json`, "utf8"),
      ]);
      return {
        sizeBytes: info.size,
        contentType: (JSON.parse(meta) as { contentType: string }).contentType,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async read(key: string): Promise<Uint8Array> {
    return readFile(this.path(key));
  }

  /** For LocalStorageController: path and content type of a verified download grant. */
  async open(token: string): Promise<{ path: string; contentType: string }> {
    const grant = this.verify(token, "get");
    const info = await this.head(grant.key);
    if (!info) throw new LocalStorageError("not_found");
    return { path: this.path(grant.key), contentType: info.contentType };
  }

  downloadUrl(
    key: string,
    visibility: Visibility,
    expiresInSeconds: number,
  ): Promise<string> {
    const exp =
      visibility === "public" ? null : Date.now() + expiresInSeconds * 1000;
    return Promise.resolve(this.url(this.token({ key, op: "get", exp })));
  }

  async delete(key: string): Promise<void> {
    const path = this.path(key);
    await Promise.all([
      rm(path, { force: true }),
      rm(`${path}.meta.json`, { force: true }),
    ]);
  }

  async check(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await access(this.root, constants.W_OK);
  }
}
