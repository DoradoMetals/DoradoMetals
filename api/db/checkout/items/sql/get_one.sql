-- One line, by id.
SELECT id, checkout_id, bullion_id, metal_id, pre_melt, post_melt, purity,
       content, unit, premium, quantity, created_at, updated_at,
       created_by, updated_by FROM checkout.items WHERE id = $1
