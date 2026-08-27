-- One package, by id.
SELECT id, carrier_id, label, length, width, height, is_carrier_packaging,
       image_id, created_at, updated_at
  FROM shipping.packages
 WHERE id = $1
