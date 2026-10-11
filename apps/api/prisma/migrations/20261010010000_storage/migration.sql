-- CreateTable
CREATE TABLE "storage_objects" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "owner_id" TEXT,
    "visibility" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "upload_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "storage_objects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "storage_objects_key_key" ON "storage_objects"("key");

-- CreateIndex
CREATE INDEX "storage_objects_status_upload_expires_at_idx" ON "storage_objects"("status", "upload_expires_at");
