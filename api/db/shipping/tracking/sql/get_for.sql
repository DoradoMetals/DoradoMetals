-- Every scan event for one shipment, oldest first. `time` aliases back to `scan_time` - the wire has always carried that name.
SELECT id, shipment_id, status, location, time AS scan_time
  FROM shipping.tracking
 WHERE shipment_id = $1
 ORDER BY time ASC, id ASC
