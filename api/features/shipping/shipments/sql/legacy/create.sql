-- The same shipment in the schema still serving as record of truth, which keeps
-- the order link on the shipment's own row.
INSERT INTO exchange.shipments (id, purchase_order_id, sales_order_id, carrier_id, type)
VALUES ($1, $2, $3, $4, $5)
RETURNING id
