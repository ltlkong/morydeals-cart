import { Inject, Injectable, BadRequestException } from "@nestjs/common";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, hash } from "node:crypto";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import {
  MAX_SNAPSHOT_BYTES,
  type PageSnapshot,
} from "@morydeals/capture-contracts";
import {
  apiConfig,
  type ApiConfig,
} from "../../../core/config/schema/config.schema.ts";
const compress = promisify(gzip);
@Injectable()
export class PageSnapshotStore {
  constructor(@Inject(apiConfig.KEY) private readonly config: ApiConfig) {}
  async save(snapshot: PageSnapshot) {
    if (
      Buffer.byteLength(snapshot.html) > MAX_SNAPSHOT_BYTES ||
      Math.abs(Date.now() - Date.parse(snapshot.capturedAt)) > 5 * 60_000
    )
      throw new BadRequestException(
        "Page snapshot is too large or expired. Capture the page again.",
      );
    const bytes = Buffer.from(JSON.stringify(snapshot));
    if (bytes.length > 8 * 1024 * 1024)
      throw new BadRequestException("Page snapshot is too large.");
    const id = randomUUID();
    await mkdir(this.config.snapshotDirectory, {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(
      join(this.config.snapshotDirectory, `${id}.json.gz`),
      await compress(bytes),
      { flag: "wx", mode: 0o600 },
    );
    return { id, sha256: hash("sha256", bytes) };
  }
  async remove(id: string) {
    await rm(join(this.config.snapshotDirectory, `${id}.json.gz`), {
      force: true,
    });
  }
}
