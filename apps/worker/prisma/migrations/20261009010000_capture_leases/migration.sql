-- AlterTable
ALTER TABLE "crawler_runs" ADD COLUMN     "active_attempt_id" TEXT,
ADD COLUMN     "context" JSONB,
ADD COLUMN     "context_sha256" TEXT,
ADD COLUMN     "lease_expires_at" TIMESTAMPTZ(6);
