INSERT INTO orders.items
       (order_id, bullion_id, metal_id, pre_melt, post_melt, purity, content,
        premium, quantity, confirmed, sales_tax_charged, unit, price)
VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6::numeric,
        metals.fine_content(COALESCE($5::numeric, $4::numeric), $11::text, $6::numeric),
        $7, $8, $9, $10, $11::text, $12)
RETURNING id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity, content,
          premium, quantity, confirmed, sales_tax_charged, unit, price
