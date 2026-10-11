-- The API's browsable catalog pages through products newest observed first, with the id as tiebreak.
CREATE INDEX "tracked_products_catalog_idx" ON "tracked_products"("last_observed_at" DESC, "id" DESC);
