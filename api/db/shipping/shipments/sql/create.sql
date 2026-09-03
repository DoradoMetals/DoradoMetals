-- A new shipment.
--
-- `direction` is NOT NULL here and exchange's `type` is not, so the service
-- supplies it - see the note there. Everything else is filled in later by
-- update(), once a label has actually been bought: a shipment is created as a
-- shell the moment an order needs one, and the tracking number, cost and label
-- arrive from the carrier afterwards.
INSERT INTO shipping.shipments (id, direction, insured)
VALUES ($1, $2::shipping.direction, false)
RETURNING id
