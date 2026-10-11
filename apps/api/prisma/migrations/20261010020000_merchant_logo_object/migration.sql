ALTER TABLE "merchants"
  ADD COLUMN "logo_object_id" UUID;

ALTER TABLE "merchants"
  DROP COLUMN "logoUrl";

ALTER TABLE "merchants"
  ADD CONSTRAINT "merchants_logo_object_id_fkey"
  FOREIGN KEY ("logo_object_id") REFERENCES "storage_objects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
