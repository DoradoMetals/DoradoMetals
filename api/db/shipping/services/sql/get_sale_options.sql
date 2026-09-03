-- The sale delivery options: the business's own carrier-agnostic rows - a price and speed the customer picks; the carrier is chosen later by the refinery.
-- display=false rows ride along (FREE is the admin drawer's grant) - which rows a surface shows is the client's branch.
SELECT id, name, code, price, display, is_active,
       min_transit_days, max_transit_days
  FROM shipping.services
 WHERE carrier_id IS NULL
   AND price IS NOT NULL
   AND is_active
 ORDER BY price ASC, name ASC
