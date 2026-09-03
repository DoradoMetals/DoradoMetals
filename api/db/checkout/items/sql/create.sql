-- One cart line. SCRAP AND BULLION ARE THE SAME TABLE: the values sit here and
-- `bullion_id IS NULL` is what makes a line scrap, the same shape orders.items
-- and refiners.items use. So there is no scrap row to create and no orphan
-- scrap to sweep.
--
-- metal_id and premium ARRIVE RESOLVED. A premium is a rate banded on the
-- metal total across the whole checkout and is settled when the checkout
-- becomes an order; what a line carries is the caller's own figure, never one
-- read off a product here.
--
-- No audit columns: public.audit_stamp writes them (migration 116).
INSERT INTO checkout.items
       (checkout_id, bullion_id, metal_id, pre_melt, post_melt, purity,
        content, unit, premium, quantity)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING id, checkout_id, bullion_id, metal_id, pre_melt, post_melt, purity,
       content, unit, premium, quantity, created_at, updated_at,
       created_by, updated_by
