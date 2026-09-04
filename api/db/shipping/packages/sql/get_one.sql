SELECT id, carrier_id, label, length, width, height, is_carrier_packaging,
       image_id, created_at, updated_at, min_weight_lb
  FROM shipping.packages
 WHERE id = $1
