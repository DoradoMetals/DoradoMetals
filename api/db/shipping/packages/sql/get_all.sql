-- Every package a carrier offers. Reference data, eleven rows - read once and turned into a Map rather than joined per shipment read.
SELECT id, carrier_id, label, length, width, height, is_carrier_packaging,
       image_id, created_at, updated_at, min_weight_lb
  FROM shipping.packages
 ORDER BY carrier_id ASC, label ASC, id ASC
