-- Mirror of sql/set_refinery.sql. exchange calls it supplier_id.
UPDATE exchange.sales_orders
   SET supplier_id = $1
 WHERE id = $2
RETURNING id, supplier_id
