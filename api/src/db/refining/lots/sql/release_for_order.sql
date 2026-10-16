-- Cancelling a refiner order releases its lots (rulings 144, 145). The links
-- are stamped, never deleted, so the cancelled order still lists what it held.
-- Cancel stamps released_at only. A released link whose metal never moved
-- reads as gone, so the customer lot is back on hand; one whose metal had
-- moved reads as still at the refiner until the return is stamped on its own
-- (mark_returned.sql).
UPDATE refining.lots
   SET released_at = now()
 WHERE refining_order_id = $1
   AND released_at IS NULL
