-- The customer lot ids, among those named, that already carry a `batch`
-- edge into a refiner lot STILL LINKED to a refiner order - the pooling
-- guarantee (a lot goes to one refiner), answered by name rather than by
-- count so a caller can say which. Cancelling a refiner order, or taking one
-- lot off it, stamps the link `released_at` and keeps it (rulings 144, 145),
-- so a held link - one with no release - is what still binds the lot.
SELECT DISTINCT s.source_lot_id
  FROM inventory.lot_sources s
  JOIN refining.lots rl ON rl.lot_id = s.lot_id
 WHERE s.source_lot_id = ANY($1::uuid[])
   AND s.kind = 'batch'
   AND rl.released_at IS NULL
