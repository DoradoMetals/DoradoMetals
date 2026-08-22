-- Match products.bullion's nullability to exchange.products.
--
-- exchange declares supplier_id, image_front, image_back and stock NOT NULL.
-- products.bullion left all four nullable, which is not a deliberate
-- relaxation - nothing in the application treats them as optional, and a
-- product with no supplier or no front image is not a product the storefront
-- can render.
--
-- Verified against the data first: none of the four holds a NULL in either
-- table, so this is additive. It would fail the migration rather than alter a
-- row if that were untrue.
--
-- quantity is left nullable deliberately: exchange has it NOT NULL, but unlike
-- the others it is a count that a not-yet-stocked product could reasonably lack,
-- and tightening it is a judgement rather than a restoration. Recorded in
-- FOLLOWUPS.md instead.

ALTER TABLE products.bullion
  ALTER COLUMN supplier_id SET NOT NULL,
  ALTER COLUMN image_front SET NOT NULL,
  ALTER COLUMN image_back  SET NOT NULL,
  ALTER COLUMN stock       SET NOT NULL;
