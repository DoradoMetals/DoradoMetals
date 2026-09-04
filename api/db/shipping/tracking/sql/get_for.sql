SELECT id, shipment_id, status, location, time AS scan_time
  FROM shipping.tracking
 WHERE shipment_id = $1
 ORDER BY time ASC, id ASC
