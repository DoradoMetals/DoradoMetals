ALTER TABLE products.bullion ALTER COLUMN image_front SET DEFAULT ''::text;
ALTER TABLE products.bullion ALTER COLUMN image_back SET DEFAULT ''::text;
ALTER TABLE products.bullion DROP COLUMN IF EXISTS stock;
ALTER TABLE products.bullion DROP COLUMN IF EXISTS quantity;
