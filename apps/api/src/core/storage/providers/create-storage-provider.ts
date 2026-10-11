import { S3Client } from "@aws-sdk/client-s3";
import type { ApiConfig } from "../../config/schema/config.schema.ts";
import { LocalStorageProvider } from "./local/local-storage.provider.ts";
import { R2StorageProvider } from "./r2/r2-storage.provider.ts";
import { type StorageProvider } from "./storage-provider.ts";

export function createStorageProvider(config: ApiConfig): StorageProvider {
  if (config.storage.provider === "r2") {
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${config.storage.r2AccountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.storage.r2AccessKeyId,
        secretAccessKey: config.storage.r2SecretAccessKey,
      },
    });
    return new R2StorageProvider(
      s3,
      config.storage.r2Bucket,
      config.storage.r2PublicBaseUrl,
    );
  }
  return new LocalStorageProvider(
    config.storage.directory,
    config.storage.signingSecret,
    config.storage.publicApiUrl,
  );
}
