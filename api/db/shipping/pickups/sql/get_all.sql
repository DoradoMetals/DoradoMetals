-- Every carrier pickup's own row.
--
-- THE ORDER, THE USER AND THE CARRIER ARE NOT HERE. exchange.carrier_pickups
-- hangs a pickup off an ORDER and names its carrier in a text column; this
-- table hangs it off a SHIPMENT, and the shipment knows the rest. compose.ts
-- puts the three back by asking the shipments service, which already
-- reconstructs an order id and a carrier for exactly this reason.
--
-- shipment_id IS projected and is not on the wire - compose.ts needs it and
-- drops it again.
SELECT
       id, shipment_id, requested_at, status,
       confirmation_number, location
  FROM shipping.pickups
 ORDER BY requested_at DESC, id ASC
