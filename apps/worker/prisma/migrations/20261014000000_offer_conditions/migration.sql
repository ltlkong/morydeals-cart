-- Every offer a page shows is collected with its condition (new, used, renewed, open-box, damaged): one
-- price_observations row per offer, offer_index 0 the primary (new when the page has one). Price history is read
-- per condition, so a used price never enters the new price's history.

-- The seller of each stored offer, from the observation's own product data.
ALTER TABLE "price_observations" ADD COLUMN "seller" TEXT;
UPDATE "price_observations" AS po
SET "seller" = o."data" -> 'offers' -> po."offer_index" ->> 'seller'
FROM "product_observations" AS o
WHERE o."id" = po."observation_id"
  AND jsonb_typeof(o."data" -> 'offers') = 'array'
  AND jsonb_typeof(o."data" -> 'offers' -> po."offer_index" -> 'seller') = 'string';

-- Until parser 3.14 the Amazon.ca, Best Buy and Newegg parsers admitted only a verified new offer, so their
-- stored prices are new. Other stores did not state a condition: theirs stay unknown (null), read with new.
UPDATE "price_observations" AS po
SET "condition" = 'new'
FROM "product_observations" AS o
JOIN "tracked_products" AS p ON p."id" = o."product_id"
WHERE o."id" = po."observation_id"
  AND po."condition" IS NULL
  AND lower(substring(p."url" from '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#:]+)'))
    IN ('www.amazon.ca', 'amazon.ca', 'www.bestbuy.ca', 'bestbuy.ca', 'www.newegg.ca', 'newegg.ca');
