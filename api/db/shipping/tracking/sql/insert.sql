-- The current set of scan events, in one statement.
--
-- UNNEST rather than a row per event: a FedEx poll returns the whole history
-- every time, and twenty round trips per shipment per poll is the difference
-- between a background job and a visible one.
INSERT INTO shipping.tracking (shipment_id, status, location, time)
SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::timestamptz[])
  AS t(shipment_id, status, location, time)
