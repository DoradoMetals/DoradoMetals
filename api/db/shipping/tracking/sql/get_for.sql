SELECT id, shipment_id, status, location,
       to_char(time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS scan_time
  FROM shipping.tracking
 WHERE shipment_id = $1
 ORDER BY time ASC, id ASC
