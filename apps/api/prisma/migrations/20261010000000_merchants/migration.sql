CREATE TABLE "merchants" (
 "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "homeUrl" TEXT NOT NULL,
 "logoUrl" TEXT, "domains" TEXT[] NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
 "sortOrder" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "merchants" ("id", "name", "homeUrl", "domains", "sortOrder") VALUES
 ('amazon-ca','Amazon Canada','https://www.amazon.ca',ARRAY['amazon.ca'],10),
 ('walmart-ca','Walmart Canada','https://www.walmart.ca',ARRAY['walmart.ca'],20),
 ('bestbuy-ca','Best Buy Canada','https://www.bestbuy.ca',ARRAY['bestbuy.ca'],30),
 ('newegg-ca','Newegg Canada','https://www.newegg.ca',ARRAY['newegg.ca'],40),
 ('roborock-ca','Roborock Canada','https://ca.roborock.com',ARRAY['ca.roborock.com'],50),
 ('shokz-ca','Shokz Canada','https://ca.shokz.com',ARRAY['ca.shokz.com'],60);
