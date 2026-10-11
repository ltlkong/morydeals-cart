import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  GoneException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  STORAGE_PROVIDER,
  type StorageProvider,
  type UploadTarget,
  type Visibility,
} from "../providers/storage-provider.ts";
import {
  type StorageObject,
  StorageRepository,
} from "../persistence/storage.repository.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOAD_TTL_SECONDS = 15 * 60;
const DOWNLOAD_TTL_SECONDS = 10 * 60;
const SWEEP_BATCH = 100;
const SWEEP_BATCHES = 50;

/** What a feature allows for one purpose (e.g. product images). */
export type UploadPolicy = {
  purpose: string;
  contentTypes: readonly string[];
  maxBytes: number;
  visibility: Visibility;
};
export type Actor = { userId: string; admin: boolean };

/**
 * The single entry point for files. Business tables store storage object ids; this service
 * owns keys, provider calls and the pending → ready → deleted lifecycle.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider,
    @Inject(StorageRepository) private readonly objects: StorageRepository,
  ) {}

  private keyFor(purpose: string, id: string) {
    if (!/^[a-z][a-z0-9_]*$/.test(purpose))
      throw new UnprocessableEntityException("invalid_storage_purpose");
    return `${purpose}/${id}`;
  }

  async createUpload(
    policy: UploadPolicy,
    request: { contentType: string; sizeBytes: number; ownerId: string },
  ): Promise<{ object: StorageObject; upload: UploadTarget }> {
    if (!policy.contentTypes.includes(request.contentType))
      throw new UnprocessableEntityException("unsupported_content_type");
    if (
      !Number.isSafeInteger(request.sizeBytes) ||
      request.sizeBytes < 1 ||
      request.sizeBytes > policy.maxBytes
    )
      throw new UnprocessableEntityException("file_too_large");
    const id = randomUUID();
    const upload = await this.provider.createUpload(
      this.keyFor(policy.purpose, id),
      request.contentType,
      request.sizeBytes,
      UPLOAD_TTL_SECONDS,
    );
    const object = await this.objects.insert({
      id,
      provider: this.provider.name,
      key: this.keyFor(policy.purpose, id),
      purpose: policy.purpose,
      contentType: request.contentType,
      sizeBytes: request.sizeBytes,
      ownerId: request.ownerId,
      visibility: policy.visibility,
      status: "pending",
      uploadExpiresAt: upload.expiresAt,
    });
    return { object, upload };
  }

  /** Server-side write (generated or imported files); the object is ready immediately. */
  async put(
    policy: UploadPolicy,
    body: Uint8Array,
    contentType: string,
    ownerId: string | null,
  ): Promise<StorageObject> {
    if (!policy.contentTypes.includes(contentType))
      throw new UnprocessableEntityException("unsupported_content_type");
    if (body.byteLength < 1 || body.byteLength > policy.maxBytes)
      throw new UnprocessableEntityException("file_too_large");
    const id = randomUUID();
    const key = this.keyFor(policy.purpose, id);
    await this.provider.put(key, body, contentType);
    return this.objects.insert({
      id,
      provider: this.provider.name,
      key,
      purpose: policy.purpose,
      contentType,
      sizeBytes: body.byteLength,
      ownerId,
      visibility: policy.visibility,
      status: "ready",
      uploadExpiresAt: new Date(),
    });
  }

  async get(id: string): Promise<StorageObject> {
    const [object] = UUID.test(id) ? await this.objects.find([id]) : [];
    if (!object || object.status === "deleted")
      throw new NotFoundException("storage_object_not_found");
    return object;
  }

  /**
   * Verifies the uploaded bytes match what was declared. `inspect` lets the caller vet content
   * (e.g. moderation) before the object becomes usable; a thrown error keeps it pending.
   */
  async complete(
    id: string,
    ownerId: string,
    inspect?: (
      object: StorageObject,
      bytes: () => Promise<Uint8Array>,
    ) => Promise<void>,
  ) {
    const object = await this.get(id);
    if (object.ownerId !== ownerId)
      throw new ForbiddenException("not_object_owner");
    if (object.status === "ready") return object;
    if (object.uploadExpiresAt.getTime() < Date.now())
      throw new GoneException("upload_expired");
    const stored = await this.provider.head(object.key);
    if (!stored) throw new ConflictException("upload_missing");
    if (
      stored.sizeBytes !== object.sizeBytes ||
      stored.contentType !== object.contentType
    ) {
      await this.discard(object);
      throw new UnprocessableEntityException("upload_mismatch");
    }
    await inspect?.(object, () => this.provider.read(object.key));
    const ready = await this.objects.transition(id, "pending", "ready");
    if (!ready) throw new ConflictException("upload_not_pending");
    return ready;
  }

  /** For features referencing objects: all must exist, be ready, owned by the user and of this purpose. */
  async claim(
    ids: string[],
    ownerId: string,
    purpose: string,
  ): Promise<StorageObject[]> {
    const unique = [...new Set(ids)];
    // Ids are uuid columns: anything else can name no object (and would fail the query as a 500), so it is invalid input.
    if (!unique.every((id) => UUID.test(id)))
      throw new UnprocessableEntityException("invalid_storage_objects");
    const found = await this.objects.find(unique);
    const valid = found.filter(
      (o) =>
        o.status === "ready" && o.ownerId === ownerId && o.purpose === purpose,
    );
    if (valid.length !== unique.length)
      throw new UnprocessableEntityException("invalid_storage_objects");
    return valid;
  }

  /** The bytes of a ready object its owner uploaded, of the given purpose. */
  async readOwned(
    id: string,
    ownerId: string,
    purpose: string,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    if (!UUID.test(id))
      throw new UnprocessableEntityException("invalid_storage_objects");
    const [object] = await this.objects.find([id]);
    if (!object || object.status === "deleted")
      throw new GoneException("storage_object_gone");
    if (
      object.status !== "ready" ||
      object.ownerId !== ownerId ||
      object.purpose !== purpose
    )
      throw new UnprocessableEntityException("invalid_storage_objects");
    return {
      bytes: await this.provider.read(object.key),
      contentType: object.contentType,
    };
  }

  /** Batch id → URL for ready objects; unknown, pending or deleted ids are simply absent. */
  async urlsFor(ids: string[]): Promise<Map<string, string>> {
    const uuids = [...new Set(ids)].filter((id) => UUID.test(id));
    const objects = (await this.objects.find(uuids)).filter(
      (object) => object.status === "ready",
    );
    return new Map(
      await Promise.all(
        objects.map(
          async (object) => [object.id, await this.urlFor(object)] as const,
        ),
      ),
    );
  }

  urlFor(object: StorageObject): Promise<string> {
    return this.provider.downloadUrl(
      object.key,
      object.visibility,
      DOWNLOAD_TTL_SECONDS,
    );
  }

  async delete(id: string, actor: Actor): Promise<void> {
    const object = await this.get(id);
    if (!actor.admin && object.ownerId !== actor.userId)
      throw new ForbiddenException("not_object_owner");
    await this.discard(object);
  }

  /** Marks the row deleted first, then removes bytes; a failed byte delete leaves an orphan, never a dangling row. */
  private async discard(object: StorageObject) {
    const deleted = await this.objects.transition(
      object.id,
      object.status,
      "deleted",
    );
    if (deleted) await this.provider.delete(object.key);
  }

  /**
   * Removes expired uploads batch after batch while every upload of a batch is removed (at most SWEEP_BATCHES): one
   * batch per run fell behind uploads that are never completed. A batch with a failure ends the run, so failing uploads
   * are not retried in a loop. Run hourly by core/scheduling.
   */
  async sweepExpiredUploads(): Promise<void> {
    const now = new Date();
    for (let run = 0; run < SWEEP_BATCHES; run++) {
      if ((await this.cleanupExpired(now)) < SWEEP_BATCH) break;
    }
  }

  /** Removes one batch of uploads that were never completed; the number removed. */
  async cleanupExpired(now = new Date(), batch = SWEEP_BATCH): Promise<number> {
    const expired = await this.objects.expiredPending(now, batch);
    let removed = 0;
    for (const object of expired) {
      try {
        await this.discard(object);
        removed++;
      } catch (error) {
        this.logger.warn(
          `storage_cleanup_failed id=${object.id} reason=${error instanceof Error ? error.name : "unknown"}`,
        );
      }
    }
    return removed;
  }

  async check(): Promise<void> {
    await this.provider.check();
  }
}
