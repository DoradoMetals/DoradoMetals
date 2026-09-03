-- One basket line. `bullion_id IS NULL` is what makes it a declared lot.
-- Every value arrives resolved by domain/checkout/rules.ts; a request names none.
-- No audit columns: public.audit_stamp writes them (migration 116).
INSERT INTO checkout.items
       (checkout_id, bullion_id, metal_id, pre_melt, post_melt, purity,
        content, unit, premium, quantity)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING id, checkout_id, bullion_id, metal_id, pre_melt, post_melt, purity,
       content, unit, premium, quantity, created_at, updated_at,
       created_by, updated_by
