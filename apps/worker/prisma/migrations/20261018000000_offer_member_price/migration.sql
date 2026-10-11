-- A Prime member price is its own offer (purchase_type 'member'), like a Subscribe & Save price: the same new item
-- from the same seller at a price only members pay. It keeps its own price series and is never the primary, so the
-- regular (non-member) price's history is never mixed with member prices. Widening the check only: no existing row
-- changes (member rows were never collected before parser 3.18.0).
ALTER TABLE "price_observations" DROP CONSTRAINT "price_observations_purchase_type_check";
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_purchase_type_check"
  CHECK ("purchase_type" IS NULL OR "purchase_type" IN ('one_time', 'subscription', 'member'));

-- The savings percent a page states beside the struck price ("-26%"), kept on the offer with compare_at_label.
-- Parser 3.17.0 stored it only inside a duplicate `sale` promotion ("Was $2,299.99", percentOff); copy it over so
-- existing rows keep it (the API no longer shows that promotion as a separate deal).
ALTER TABLE "price_observations" ADD COLUMN "savings_percent" INTEGER;
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_savings_percent_check"
  CHECK ("savings_percent" IS NULL OR ("savings_percent" > 0 AND "savings_percent" < 100));
UPDATE "price_observations" AS po
SET "savings_percent" = stated."percent"
FROM (
  SELECT o."observation_id", o."offer_index", MAX((deal ->> 'percentOff')::numeric)::int AS "percent"
  FROM "price_observations" AS o,
    jsonb_array_elements(CASE WHEN jsonb_typeof(o."promotions") = 'array' THEN o."promotions" ELSE '[]'::jsonb END) AS deal
  WHERE deal ->> 'type' = 'sale'
    AND deal ->> 'evidence' LIKE '%/reference-price'
    AND (deal ->> 'percentOff') ~ '^[0-9]{1,2}(\.0+)?$'
    AND (deal ->> 'percentOff')::numeric > 0
  GROUP BY o."observation_id", o."offer_index"
) AS stated
WHERE po."observation_id" = stated."observation_id"
  AND po."offer_index" = stated."offer_index"
  AND po."savings_percent" IS NULL;
