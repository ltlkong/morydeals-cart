-- Selected variant and rating of each tracked product (latest capture); condition and deals of each price
-- observation, beside its availability. Existing rows keep their data: their variant, rating, condition and
-- deals are unknown (null), except Shopify products, whose stored data already names the selected variant.
ALTER TABLE "tracked_products"
  ADD COLUMN "variant_id" TEXT,
  ADD COLUMN "variant_label" TEXT,
  ADD COLUMN "rating_value" DOUBLE PRECISION,
  ADD COLUMN "rating_scale" DOUBLE PRECISION,
  ADD COLUMN "rating_count" INTEGER,
  ADD CONSTRAINT "tracked_products_rating_check" CHECK (
    ("rating_value" IS NULL AND "rating_scale" IS NULL AND "rating_count" IS NULL)
    OR ("rating_value" >= 0 AND "rating_scale" > 0 AND "rating_value" <= "rating_scale"
        AND ("rating_count" IS NULL OR "rating_count" > 0))
  );

ALTER TABLE "price_observations"
  ADD COLUMN "condition" TEXT,
  ADD COLUMN "promotions" JSONB,
  ADD CONSTRAINT "price_observations_condition_check" CHECK (
    "condition" IS NULL OR "condition" IN ('new', 'used', 'renewed', 'open_box', 'damaged')
  ),
  ADD CONSTRAINT "price_observations_promotions_check" CHECK (
    "promotions" IS NULL OR jsonb_typeof("promotions") = 'array'
  );

UPDATE "tracked_products"
SET "variant_id" = "data"->>'variantId'
WHERE "data" ? 'variantId' AND jsonb_typeof("data"->'variantId') = 'string';
