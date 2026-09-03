-- Every pickup hanging off any of these shipments.
--
-- This is how "the pickups of an order" is answered: the order's shipments are
-- resolved first, and their pickups read in one statement rather than one query
-- per shipment.
SELECT
       id, shipment_id, requested_at, status,
       confirmation_number, location
  FROM shipping.pickups
 WHERE shipment_id = ANY($1::uuid[])
 ORDER BY requested_at DESC, id ASC
