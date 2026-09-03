-- A new row. An explicit id wins; NULL generates one.
--
-- NO AUDIT COLUMNS. public.audit_stamp writes created_at, updated_at,
-- created_by and updated_by from the actor on the connection (migration 116).
-- rates.rates.created_by defaults to 'Dorado Admin', which is why the trigger
-- prefers the actor's real name over what NEW carries - see 116's header.
INSERT INTO rates.rates
       (id, metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct)
VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7)
RETURNING id, metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct,
          created_at, updated_at, created_by, updated_by
