CREATE TABLE "anonymous_users" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "anonymous_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "anonymous_users_token_hash_key" ON "anonymous_users"("token_hash");

CREATE TABLE "cart_items" (
    "user_id" UUID NOT NULL,
    "product_url" TEXT NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("user_id", "product_url"),
    CONSTRAINT "cart_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "anonymous_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "cart_items_user_id_added_at_idx" ON "cart_items"("user_id", "added_at");
