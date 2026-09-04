INSERT INTO orders.items
       (id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity, content,
        premium, quantity, confirmed, sales_tax_charged, unit, price)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity, content,
          premium, quantity, confirmed, sales_tax_charged, unit, price
