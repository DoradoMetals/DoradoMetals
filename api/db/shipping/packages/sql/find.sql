SELECT id, carrier_id, label, length, width, height, is_carrier_packaging,
       image_id, created_at, updated_at, min_weight_lb
  FROM shipping.packages
 WHERE carrier_id = $1 AND label = $2
 LIMIT 1
