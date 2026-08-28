-- EVERY SHIPMENT ON ONE ORDER, BOTH DIRECTIONS, IN ONE ANSWER.
--
-- shipping.shipments carries no order id, so the link is walked the way the
-- schema stores it: fulfillments.fulfillments names the order, and
-- fulfillments.shipments names the parcels that satisfy it. THE CHAIN IS
-- RESOLVED HERE, IN THE WHERE CLAUSE (ruling 12) - the response is rows of
-- one table, not a nesting.
--
-- ONE ARRAY, NOT TWO NAMED SLOTS. The composed order wire carried `shipment`
-- and `return_shipment`, which was two names for one table that already has a
-- `direction` column (Inbound / Outbound / Return - shipping.direction, NOT
-- orders.direction). The frontend filters on it, and an order with two
-- outbound parcels stops being unrepresentable.
--
-- The VERBATIM row (ruling 12), including actual_cost, which the composed
-- shape dropped. Two columns are REPRESENTED rather than renamed, which is
-- not the same thing as a join:
--
--   direction  cast to text, like every other read of this table - the wire
--              has always carried a string.
--   label      encode(..., 'base64'). It is a BYTEA, and the driver hands
--              back a Buffer that serialises as
--              {"type":"Buffer","data":[137,80,...]} - one integer per byte,
--              which features/orders/fragments.ts measured at half a megabyte
--              across 23 rows against 13KB encoded. Postgres's own encode
--              produces MIME base64, a newline every 76 characters, and that
--              wrapped form is what the frontend decodes today.
SELECT s.id, s.carrier_service_id, s.package_id,
       s.recipient_address_id, s.shipper_address_id,
       s.tracking_number, s.delivered_at, s.shipped_at, s.est_delivery,
       s.label_type, encode(s.label, 'base64') AS label,
       s.direction::text AS direction,
       s.insured, s.declared_value, s.cost, s.actual_cost,
       s.shipping_status, s.pickup_type, s.created_at
  FROM shipping.shipments s
  JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
  JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
 WHERE f.order_id = $1
 ORDER BY s.created_at ASC, s.id ASC
