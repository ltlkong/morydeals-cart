-- Raw files/context/parser traces live in an audit bundle; keep only its reference.
-- Existing directory references are converted by migrate-audit-archives.ts after deployment.
ALTER TABLE "crawler_attempts" RENAME COLUMN "archive_path" TO "audit_id";
ALTER TABLE "crawler_attempts" DROP COLUMN "raw_sha256";
ALTER TABLE "crawler_runs" DROP COLUMN "context", DROP COLUMN "result";
