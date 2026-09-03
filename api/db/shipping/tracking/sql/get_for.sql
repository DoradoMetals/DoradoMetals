-- Every scan event for one shipment, oldest first.
--
-- `time` is the new schema's name for exchange's `scan_time`, and it is aliased
-- back: the response has always carried scan_time and the frontend reads it.
SELECT id, shipment_id, status, location, time AS scan_time
  FROM shipping.tracking
 WHERE shipment_id = $1
 ORDER BY time ASC, id ASC
