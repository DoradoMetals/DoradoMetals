UPDATE shipping.shipments s
   SET cost = $1
  FROM fulfillments.shipments fs
  JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
 WHERE fs.shipment_id = s.id
   AND f.order_id = $2
RETURNING s.id
