-- The same line. exchange calls the rate `sales_tax_rate` where the new schema
-- calls it `sales_tax_charged`.
INSERT INTO exchange.sales_order_items
       (id, sales_order_id, product_id, price, quantity, premium, sales_tax_rate)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id
