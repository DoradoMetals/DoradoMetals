-- runs-even-under-a-baseline: 023 adds products.bullion.stock and quantity and
--   RUNS on a genesis build (it carries an UPDATE), so only this file removes
--   them again. Stamped, the rebuilt catalogue kept two columns dev does not
--   have. Measured 2026-09-06 on a production-shaped copy.
--
ALTER TABLE products.bullion ALTER COLUMN image_front SET DEFAULT ''::text;
ALTER TABLE products.bullion ALTER COLUMN image_back SET DEFAULT ''::text;
ALTER TABLE products.bullion DROP COLUMN IF EXISTS stock;
ALTER TABLE products.bullion DROP COLUMN IF EXISTS quantity;
