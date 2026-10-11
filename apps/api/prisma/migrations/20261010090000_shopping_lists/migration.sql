CREATE TABLE "shopping_lists" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "shopping_lists_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shopping_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "anonymous_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "shopping_lists_user_id_created_at_idx" ON "shopping_lists"("user_id", "created_at");
CREATE TABLE "shopping_list_items" (
    "list_id" UUID NOT NULL,
    "product_url" TEXT NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shopping_list_items_pkey" PRIMARY KEY ("list_id", "product_url"),
    CONSTRAINT "shopping_list_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "shopping_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "shopping_list_items_list_id_added_at_idx" ON "shopping_list_items"("list_id", "added_at");
