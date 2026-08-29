-- Mirror of sql/insert.sql. exchange calls the column `scan_time`.
INSERT INTO exchange.tracking_events (shipment_id, status, location, scan_time)
SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::timestamptz[])
  AS t(shipment_id, status, location, scan_time)
