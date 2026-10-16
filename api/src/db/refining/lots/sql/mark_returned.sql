-- The refiner's metal is back (ruling 145): stamp returned_at on every link of
-- a cancelled order that was released while the metal was away.
UPDATE refining.lots
   SET returned_at = now()
 WHERE refining_order_id = $1
   AND released_at IS NOT NULL
   AND returned_at IS NULL
