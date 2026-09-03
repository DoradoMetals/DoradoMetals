-- The current set of scan events, one statement via UNNEST - avoids twenty round trips per shipment per poll.
INSERT INTO shipping.tracking (shipment_id, status, location, time)
SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::timestamptz[])
  AS t(shipment_id, status, location, time)
