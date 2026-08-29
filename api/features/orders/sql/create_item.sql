-- A line on a sales order. Always bullion - a sale has no scrap - so bullion_id
-- is never null and the metal comes from the product.
--
-- sales_tax_charged is NOT NULL here and is exchange's `sales_tax_rate`.
INSERT INTO orders.items
       (id, order_id, bullion_id, metal_id, price, quantity, premium,
        sales_tax_charged, confirmed)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
RETURNING id
