-- The direction of several orders at once.
--
-- This is hop THREE of putting an order id back onto a shipment.
-- shipping.shipments carries neither purchase_order_id nor sales_order_id,
-- because an order's FULFILLMENT is what knows about the order - so the id is
-- found through fulfillments and then the direction decides which of the two
-- columns it lands in. A purchase fills purchase_order_id, a sale fills
-- sales_order_id, and getting that backwards puts every shipment on the wrong
-- kind of order.
SELECT id, direction::text AS direction
  FROM orders.orders
 WHERE id = ANY($1::uuid[])
