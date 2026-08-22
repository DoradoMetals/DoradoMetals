-- Give the new schemas the defaults the old one already had.
--
-- Five tables declare an id with no default, so every insert has to generate a
-- uuid itself; eight timestamp columns have no default, so every insert has to
-- supply now(). exchange does both for you, which is why nothing noticed - the
-- new tables have only ever been written by a bulk copy that supplied every
-- column explicitly.
--
-- Additive: existing rows are untouched, and a column default only applies to
-- inserts that omit the column.

ALTER TABLE core.images ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE core.metals ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE orders.offers ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE orders.orders ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE orders.transactions ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE orders.offers ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE orders.offers ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE orders.orders ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE orders.orders ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE orders.transactions ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE orders.transactions ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE shipping.services ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE shipping.services ALTER COLUMN updated_at SET DEFAULT now();
