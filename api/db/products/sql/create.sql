-- A new product.
--
-- SIX VALUES ARE SUPPLIED THAT exchange DEFAULTS, and that is not padding.
-- exchange.products defaults metal_id, supplier_id, mint_id, image_front,
-- image_back, stock and quantity; products.bullion declares all of them NOT
-- NULL with no default. The create path sends only a name, so writing that row
-- here raises 23502 - which is exactly what the migrated insert this replaces
-- did:
--
--     INSERT INTO products.bullion (created_by, updated_by, name)
--
-- It never fired, because the dual write inserted into exchange and mirrored the
-- row back; it would have failed the moment reads pivoted. service.ts now passes
-- exchange's own defaults explicitly, so a product created either way is the
-- same product.
--
-- created_by AND updated_by USED TO BE THE FIRST TWO PARAMETERS AND ARE GONE.
-- Both columns are NOT NULL DEFAULT '', so the trigger cannot COALESCE its way
-- past the default - public.audit_stamp assigns the actor's name outright on
-- INSERT, and leaves the '' only when nobody is signed in (migration 116).
INSERT INTO products.bullion
       (id, name,
        metal_id, mint_id, supplier_id,
        image_front, image_back, stock, quantity)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id
