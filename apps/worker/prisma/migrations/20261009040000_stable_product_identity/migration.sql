BEGIN;

LOCK TABLE tracked_products, product_observations IN ACCESS EXCLUSIVE MODE;

-- Keep every observation (and its attached prices) even when two legacy products
-- were recorded in the same run. Run ownership already prevents double completion.
DROP INDEX product_observations_run_id_product_id_key;
CREATE INDEX product_observations_run_product_idx ON product_observations(run_id, product_id);

CREATE TEMP TABLE product_identity_merge ON COMMIT DROP AS
SELECT id AS old_id,
       first_value(id) OVER (PARTITION BY url ORDER BY last_observed_at DESC, id) AS kept_id
FROM tracked_products;

UPDATE product_observations AS observation
SET product_id = mapping.kept_id
FROM product_identity_merge AS mapping
WHERE observation.product_id = mapping.old_id AND mapping.old_id <> mapping.kept_id;

DELETE FROM tracked_products AS product
USING product_identity_merge AS mapping
WHERE product.id = mapping.old_id AND mapping.old_id <> mapping.kept_id;

-- Index a fixed-size digest: supported URLs can exceed PostgreSQL's btree entry limit.
ALTER TABLE tracked_products ADD COLUMN identity_key text;
UPDATE tracked_products SET identity_key = encode(sha256(convert_to(url, 'UTF8')), 'hex');
ALTER TABLE tracked_products ALTER COLUMN identity_key SET NOT NULL;
CREATE UNIQUE INDEX tracked_products_identity_key ON tracked_products(identity_key);
COMMIT;
