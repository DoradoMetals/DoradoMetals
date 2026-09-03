-- The boxes a checkout offers (D208): the carrier-agnostic generics plus the
-- carrier's own branded packaging. The per-carrier generic DUPLICATES are
-- excluded - a customer picking "Small Box" is not picking a carrier's box;
-- the branded rows genuinely are the carrier's and ride with their flag, which
-- is what the selector's toggle splits on.
SELECT id, label, length, width, height, is_carrier_packaging, min_weight_lb
  FROM shipping.packages
 WHERE carrier_id IS NULL OR is_carrier_packaging = true
 ORDER BY is_carrier_packaging ASC, min_weight_lb ASC NULLS LAST, label ASC
