-- One rule for what a line's fine content is, stated once (MP F1). A catalogue
-- line takes the product's own fine content; a declared lot derives it from the
-- weights, in `metals.fine_content`, which is the only definition of the
-- conversion. Nothing the caller sends can set it.
INSERT INTO checkout.items
       (checkout_id, bullion_id, metal_id, pre_melt, post_melt, purity,
        content, unit, premium, quantity)
VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6::numeric,
        CASE WHEN $2::uuid IS NULL
             THEN metals.fine_content(COALESCE($5::numeric, $4::numeric), $7::text, $6::numeric)
             ELSE (SELECT b.content FROM products.bullion b WHERE b.id = $2::uuid) END,
        $7::text, $8, $9)
RETURNING id, checkout_id, bullion_id, metal_id, pre_melt, post_melt, purity,
       content, unit, premium, quantity, created_at, updated_at,
       created_by, updated_by
