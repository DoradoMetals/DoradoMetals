-- The package a carrier calls by this label.
--
-- exchange.shipments stores `package` as TEXT and the new schema stores a
-- reference, so a write arriving with exchange's shape has to resolve it. The
-- pair is the identity: two carriers may both offer a "Small Box".
SELECT id, carrier_id, label, length, width, height, is_carrier_packaging,
       image_id, created_at, updated_at
  FROM shipping.packages
 WHERE carrier_id = $1 AND label = $2
 LIMIT 1
