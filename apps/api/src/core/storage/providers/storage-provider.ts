export type Visibility = "public" | "private";
export type UploadTarget = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: Date;
};
export type StoredObjectInfo = { sizeBytes: number; contentType: string };

/** Byte storage boundary. Keys are chosen by StorageService; providers never see business data. */
export interface StorageProvider {
  readonly name: "local" | "r2";
  /** Direct client upload of exactly `sizeBytes` bytes of `contentType`. */
  createUpload(
    key: string,
    contentType: string,
    sizeBytes: number,
    expiresInSeconds: number,
  ): Promise<UploadTarget>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  head(key: string): Promise<StoredObjectInfo | null>;
  read(key: string): Promise<Uint8Array>;
  /** Stable URL for public objects; short-lived signed URL for private ones. */
  downloadUrl(
    key: string,
    visibility: Visibility,
    expiresInSeconds: number,
  ): Promise<string>;
  delete(key: string): Promise<void>;
  /** Throws when the backing store is unusable. */
  check(): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol("STORAGE_PROVIDER");
