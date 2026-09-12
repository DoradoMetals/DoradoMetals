-- The customer lot ids, among those named, that already carry a `batch`
-- edge into a refiner lot STILL LINKED to a refiner order - the pooling
-- guarantee (a lot goes to one refiner), answered by name rather than by
-- count so a caller can say which. Cancelling a refiner order deletes the
-- link, not the minted lot or its edge, so the join to refining.lots is
-- what actually frees the customer lot to be batched again.
SELECT DISTINCT s.source_lot_id
  FROM inventory.lot_sources s
  JOIN refining.lots rl ON rl.lot_id = s.lot_id
 WHERE s.source_lot_id = ANY($1::uuid[])
   AND s.kind = 'batch'
