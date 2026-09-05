SELECT id, name, code, price, display, is_active,
       min_transit_days, max_transit_days
  FROM shipping.services
 WHERE carrier_id IS NULL
   AND price IS NOT NULL
   AND is_active
 ORDER BY price ASC, name ASC
