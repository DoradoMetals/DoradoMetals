-- Give products.bullion homes for the three columns it dropped.
--
-- exchange.products carries supplier_id, stock and quantity, all three
-- populated on every one of the 62 rows. products.bullion has none of them, and
-- no table anywhere in the new schemas holds inventory - so migrating as-is
-- would have discarded them with nowhere to put them back from.
--
--   supplier_id  references refiners.refiners, which is where a supplier's id
--                now lives. Every existing value resolves there already,
--                because the suppliers migration preserved the id rather than
--                minting a new one. getAllAdminProducts joins on this, so
--                without it every product loses its supplier in the admin list.
--   stock        numeric, as in exchange
--   quantity     numeric, as in exchange
--
-- Added with a foreign key that exchange never had - exchange.products.supplier_id
-- has no constraint, so nothing stopped it holding an id that referenced
-- nothing.
--
-- Backfilled from exchange in the same migration, since the ids already line up
-- one for one. exchange is untouched.

ALTER TABLE products.bullion
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES refiners.refiners(id),
  ADD COLUMN IF NOT EXISTS stock       numeric,
  ADD COLUMN IF NOT EXISTS quantity    numeric;

UPDATE products.bullion b
SET supplier_id = e.supplier_id,
    stock       = e.stock,
    quantity    = e.quantity
FROM exchange.products e
WHERE b.id = e.id;
