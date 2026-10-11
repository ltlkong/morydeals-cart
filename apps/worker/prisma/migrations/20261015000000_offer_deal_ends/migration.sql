-- Each offer's deal end: when its soonest-ending deal ends, and whether that end was stated by the store (exact) or
-- computed from the page's relative countdown plus the capture time (estimated). The capture time is the
-- observation's observed_at; it is not repeated here. Additive: existing rows keep working unchanged.
ALTER TABLE "price_observations"
  ADD COLUMN "deal_ends_at" TIMESTAMPTZ(6),
  ADD COLUMN "deal_ends_estimated" BOOLEAN NOT NULL DEFAULT false;

-- Backfill from the deals already stored with each offer: until now an end was kept only when the store stated an
-- instant with its zone, so every backfilled end is exact.
UPDATE "price_observations" AS po
SET "deal_ends_at" = ends.ends_at
FROM (
  SELECT p."observation_id", p."offer_index", min((deal ->> 'validUntil')::timestamptz) AS ends_at
  FROM "price_observations" AS p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p."promotions") = 'array' THEN p."promotions" ELSE '[]'::jsonb END
  ) AS deal
  WHERE deal ->> 'validUntil' ~ '^\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|[+-]\d{2}:?\d{2})$'
  GROUP BY p."observation_id", p."offer_index"
) AS ends
WHERE po."observation_id" = ends."observation_id" AND po."offer_index" = ends."offer_index";

CREATE INDEX "price_observations_deal_ends_idx" ON "price_observations"("deal_ends_at");
