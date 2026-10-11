-- Offer facts the page states beside a price (parser 3.17.0). Additive and nullable: earlier captures did not read
-- them, so there is nothing to backfill; a null means "not read", never "none".
ALTER TABLE "price_observations"
  ADD COLUMN "compare_at_label" TEXT,
  ADD COLUMN "ships_from" TEXT,
  ADD COLUMN "delivery" TEXT,
  ADD COLUMN "stock_quantity" INTEGER,
  ADD COLUMN "fee" TEXT;

ALTER TABLE "price_observations"
  ADD CONSTRAINT "price_observations_stock_quantity_check" CHECK ("stock_quantity" IS NULL OR "stock_quantity" >= 0);
