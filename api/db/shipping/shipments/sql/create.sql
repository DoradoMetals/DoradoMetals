-- A new shipment. `direction` is NOT NULL - the service always supplies it.
-- Everything else fills in later, via update(), once a label is bought.
INSERT INTO shipping.shipments (id, direction, insured)
VALUES ($1, $2::shipping.direction, false)
RETURNING id
