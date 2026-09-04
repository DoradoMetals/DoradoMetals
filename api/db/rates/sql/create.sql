-- A new band. An explicit id wins; NULL generates one.
-- Audit columns are written by public.audit_stamp from the actor on the
-- connection, not this statement.
INSERT INTO rates.rates
       (id, metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct)
VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7)
RETURNING id
