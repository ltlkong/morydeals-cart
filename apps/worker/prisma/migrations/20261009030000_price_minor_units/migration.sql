BEGIN;

-- Temporary conversion helpers disappear after migration. No rounding of old prices.
CREATE FUNCTION pg_temp.to_minor(amount numeric, currency text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE converted numeric;
BEGIN
  converted := amount * power(10::numeric, CASE currency
      WHEN 'BHD' THEN 3
      WHEN 'BIF' THEN 0
      WHEN 'CLF' THEN 4
      WHEN 'CLP' THEN 0
      WHEN 'DJF' THEN 0
      WHEN 'GNF' THEN 0
      WHEN 'IQD' THEN 3
      WHEN 'ISK' THEN 0
      WHEN 'JOD' THEN 3
      WHEN 'JPY' THEN 0
      WHEN 'KMF' THEN 0
      WHEN 'KRW' THEN 0
      WHEN 'KWD' THEN 3
      WHEN 'LYD' THEN 3
      WHEN 'OMR' THEN 3
      WHEN 'PYG' THEN 0
      WHEN 'RWF' THEN 0
      WHEN 'TND' THEN 3
      WHEN 'UGX' THEN 0
      WHEN 'UYI' THEN 0
      WHEN 'UYW' THEN 4
      WHEN 'VND' THEN 0
      WHEN 'VUV' THEN 0
      WHEN 'XAF' THEN 0
      WHEN 'XAG' THEN 0
      WHEN 'XAU' THEN 0
      WHEN 'XBA' THEN 0
      WHEN 'XBB' THEN 0
      WHEN 'XBC' THEN 0
      WHEN 'XBD' THEN 0
      WHEN 'XDR' THEN 0
      WHEN 'XOF' THEN 0
      WHEN 'XPD' THEN 0
      WHEN 'XPF' THEN 0
      WHEN 'XPT' THEN 0
      WHEN 'XSU' THEN 0
      WHEN 'XTS' THEN 0
      WHEN 'XUA' THEN 0
      WHEN 'XXX' THEN 0
      ELSE 2 END);
  IF converted < 0 OR converted > 9007199254740991 OR converted <> trunc(converted) THEN
    RAISE EXCEPTION 'Price % % cannot be represented as safe integer minor units', amount, currency;
  END IF;
  RETURN converted::bigint;
END $$;

ALTER TABLE price_observations
  ADD COLUMN amount_minor bigint,
  ADD COLUMN compare_at_amount_minor bigint,
  ADD COLUMN compare_at_evidence text,
  ADD COLUMN currency_evidence text;

UPDATE price_observations SET
  amount_minor = pg_temp.to_minor(amount, currency),
  currency_evidence = evidence;

ALTER TABLE price_observations
  ALTER COLUMN amount_minor SET NOT NULL,
  ALTER COLUMN currency_evidence SET NOT NULL,
  DROP COLUMN amount,
  ADD CONSTRAINT price_minor_safe CHECK (amount_minor BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT compare_at_price_valid CHECK (
    (compare_at_amount_minor IS NULL AND compare_at_evidence IS NULL) OR
    (compare_at_amount_minor IS NOT NULL AND compare_at_evidence IS NOT NULL
      AND compare_at_amount_minor > amount_minor AND compare_at_amount_minor <= 9007199254740991));

-- Business JSON uses the same contract as typed price rows. Immutable ZIPs stay unchanged.
CREATE FUNCTION pg_temp.migrate_product(product jsonb) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_set(product, '{offers}', COALESCE((
    SELECT jsonb_agg(CASE WHEN offer ? 'amount' THEN
      (offer - 'amount') || jsonb_build_object(
        'amountMinor', pg_temp.to_minor((offer->>'amount')::numeric, offer->>'currency'),
        'currencyEvidence', offer->>'evidence')
      ELSE offer END ORDER BY ordinal)
    FROM jsonb_array_elements(product->'offers') WITH ORDINALITY AS offers(offer, ordinal)
  ), '[]'::jsonb));
$$;

UPDATE tracked_products SET data = pg_temp.migrate_product(data);
UPDATE product_observations SET data = pg_temp.migrate_product(data);
COMMIT;
