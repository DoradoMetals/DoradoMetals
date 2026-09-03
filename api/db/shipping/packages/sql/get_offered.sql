-- The boxes checkout offers: carrier-agnostic generics plus the carrier's own branded packaging.
-- Per-carrier generic duplicates are excluded - a customer picking "Small Box" is not picking a carrier's box.
SELECT id, label, length, width, height, is_carrier_packaging, min_weight_lb
  FROM shipping.packages
 WHERE carrier_id IS NULL OR is_carrier_packaging = true
 ORDER BY is_carrier_packaging ASC, min_weight_lb ASC NULLS LAST, label ASC
