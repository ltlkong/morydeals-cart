CREATE TABLE "external_price_points" (
    "product_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "amount_minor" BIGINT,
    "shipping_minor" BIGINT,
    "currency" CHAR(3) NOT NULL,
    CONSTRAINT "external_price_points_pkey" PRIMARY KEY ("product_id", "source", "series", "observed_at"),
    CONSTRAINT "external_price_points_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tracked_products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "external_price_points_amount_check" CHECK ("amount_minor" IS NULL OR ("amount_minor" > 0 AND "amount_minor" <= 9007199254740991))
);
CREATE TABLE "external_history_syncs" (
    "product_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "last_synced_at" TIMESTAMPTZ(6) NOT NULL,
    "last_error" TEXT,
    CONSTRAINT "external_history_syncs_pkey" PRIMARY KEY ("product_id", "source"),
    CONSTRAINT "external_history_syncs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tracked_products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "external_history_syncs_source_last_synced_at_idx" ON "external_history_syncs"("source", "last_synced_at");
