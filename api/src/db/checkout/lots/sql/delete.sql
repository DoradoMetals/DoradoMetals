WITH gone AS (
  DELETE FROM checkout.lots WHERE lot_id = $1 RETURNING lot_id
), orphans AS (
  DELETE FROM inventory.lots li
   USING gone
   WHERE li.id = gone.lot_id
     AND NOT EXISTS (SELECT 1 FROM orders.lots ol WHERE ol.lot_id = li.id)
  RETURNING li.id
)
SELECT gone.lot_id FROM gone
