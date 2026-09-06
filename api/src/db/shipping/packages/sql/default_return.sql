-- The box a return goes back in when the caller names none: the smallest
-- offered one, which is the first row `get_offered` already orders to.
SELECT id, carrier_id, label, length, width, height, is_carrier_packaging,
       image_id, created_at, updated_at, min_weight_lb
  FROM shipping.packages
 WHERE carrier_id IS NULL OR is_carrier_packaging = true
 ORDER BY is_carrier_packaging ASC, min_weight_lb ASC NULLS LAST, label ASC
 LIMIT 1
