-- One statement, so two concurrent label purchases cannot both pass. The second
-- UPDATE waits on the first's row lock, re-reads under READ COMMITTED and
-- matches nothing, so it buys no label (LD F5).
UPDATE shipping.shipments
   SET shipping_status = 'Label Pending'
 WHERE id = $1
   AND tracking_number IS NULL
   AND shipping_status IS DISTINCT FROM 'Label Pending'
RETURNING id
