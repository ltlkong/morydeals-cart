-- How each offer's price is bought: once, or as a subscription (Amazon Subscribe & Save). A subscription price is
-- its own offer with its own price series; it never enters the one-time price's history or becomes the primary.
-- Additive: every existing offer was a one-time purchase (subscription rows were refused until now).
ALTER TABLE "price_observations" ADD COLUMN "purchase_type" TEXT DEFAULT 'one_time';
UPDATE "price_observations" SET "purchase_type" = 'one_time' WHERE "purchase_type" IS NULL;
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_purchase_type_check"
  CHECK ("purchase_type" IS NULL OR "purchase_type" IN ('one_time', 'subscription'));
