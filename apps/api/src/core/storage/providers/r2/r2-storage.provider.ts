import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  StorageProvider,
  StoredObjectInfo,
  UploadTarget,
  Visibility,
} from "../storage-provider.ts";

/** Cloudflare R2 through its S3-compatible API (path-style). */
export class R2StorageProvider implements StorageProvider {
  readonly name = "r2" as const;

  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
    private readonly publicBaseUrl: string,
  ) {}

  async createUpload(
    key: string,
    contentType: string,
    sizeBytes: number,
    expiresInSeconds: number,
  ): Promise<UploadTarget> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });
    // Signing content-type and content-length makes R2 reject any other type or size.
    const url = await getSignedUrl(this.s3, command, {
      expiresIn: expiresInSeconds,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
    return {
      url,
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(sizeBytes),
      },
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    try {
      const result = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        sizeBytes: result.ContentLength ?? 0,
        contentType: result.ContentType ?? "",
      };
    } catch (error) {
      if (
        error instanceof NotFound ||
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404
      )
        return null;
      throw error;
    }
  }

  async read(key: string): Promise<Uint8Array> {
    const result = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) throw new Error("storage_object_empty");
    return result.Body.transformToByteArray();
  }

  downloadUrl(
    key: string,
    visibility: Visibility,
    expiresInSeconds: number,
  ): Promise<string> {
    if (visibility === "public") {
      return Promise.resolve(
        `${this.publicBaseUrl.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`,
      );
    }
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async check(): Promise<void> {
    await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
