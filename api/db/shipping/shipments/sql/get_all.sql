-- Every shipment's own row.
--
-- THE ORDER LINK IS NOT HERE, and that is the whole shape of this feature.
-- exchange.shipments carries purchase_order_id and sales_order_id;
-- shipping.shipments carries neither, because an order's fulfillment is what
-- knows about the order. compose.ts puts them back through three hops:
-- fulfillments.shipments -> fulfillments.fulfillments -> orders.orders, and
-- the direction decides which of the two columns the id lands in.
--
-- carrier_service_id and package_id are projected for the same reason
-- metal_id is on a product: compose.ts resolves them to `service_type`,
-- `package` and `carrier_id`, and drops the ids again.
SELECT
       id, carrier_service_id, package_id,
       recipient_address_id, shipper_address_id,
       tracking_number, shipping_status, est_delivery, shipped_at, delivered_at,
       created_at, label, label_type, pickup_type, cost, insured,
       declared_value, direction::text AS direction
  FROM shipping.shipments
 ORDER BY id ASC
