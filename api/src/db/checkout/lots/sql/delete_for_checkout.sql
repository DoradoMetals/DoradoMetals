-- The links go; a lot goes with them only if nothing else holds it. A basket
-- that became an order left its lots on `orders.lots`, and those are the same
-- rows the refiner will settle.
WITH gone AS (
  DELETE FROM checkout.lots WHERE checkout_id = $1 RETURNING lot_id
), orphans AS (
  DELETE FROM lots.items li
   USING gone
   WHERE li.id = gone.lot_id
     AND NOT EXISTS (SELECT 1 FROM orders.lots ol WHERE ol.lot_id = li.id)
  RETURNING li.id
)
SELECT gone.lot_id FROM gone
