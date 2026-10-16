-- Cancelling a refiner order releases its lots (rulings 144, 145). The links
-- are stamped, never deleted, so the cancelled order still lists what it held
-- and every read that asks where a lot is reads a released link as gone: the
-- customer lot is back on hand and can be batched again. $2 says whether the
-- metal had already reached the refiner; only then is the lot also returned.
UPDATE refining.lots
   SET released_at = now(),
       returned_at = CASE WHEN $2::boolean THEN now() ELSE NULL END
 WHERE refining_order_id = $1
   AND released_at IS NULL
