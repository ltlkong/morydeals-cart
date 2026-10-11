CREATE TABLE "viewed_items" (
    "user_id" UUID NOT NULL,
    "product_url" TEXT NOT NULL,
    "viewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "viewed_items_pkey" PRIMARY KEY ("user_id", "product_url"),
    CONSTRAINT "viewed_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "anonymous_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "viewed_items_user_id_viewed_at_idx" ON "viewed_items"("user_id", "viewed_at");
