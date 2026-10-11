-- MoryCart supports a focused set of stores. Others are disabled, not deleted: a disabled store is refused, while an
-- unknown one would fall under API_ALLOW_OTHER_MERCHANTS.
INSERT INTO "merchants" ("id", "name", "homeUrl", "domains", "sortOrder")
VALUES ('uniqlo-ca', 'UNIQLO Canada', 'https://www.uniqlo.com/ca/en/', ARRAY['uniqlo.com'], 120);

UPDATE "merchants"
SET "enabled" = "id" IN ('amazon-ca', 'bestbuy-ca', 'newegg-ca', 'canadiantire-ca', 'lululemon-ca', 'uniqlo-ca');
