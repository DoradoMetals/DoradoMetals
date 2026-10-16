-- One lot taken off a refiner order (ruling 144): the link is stamped, not
-- deleted, and reads treat it as gone.
UPDATE refining.lots
   SET released_at = now()
 WHERE id = $1
   AND released_at IS NULL
RETURNING id
