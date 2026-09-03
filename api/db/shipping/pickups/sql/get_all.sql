-- Every carrier pickup's own row. Order/user/carrier aren't columns; compose.ts reconstructs them via the shipment.
-- shipment_id is projected but dropped before the wire - compose.ts needs it internally.
SELECT
       id, shipment_id, requested_at, status,
       confirmation_number, location
  FROM shipping.pickups
 ORDER BY requested_at DESC, id ASC
