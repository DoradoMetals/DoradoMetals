-- Cancelling a refiner order releases its lots: `a_lot_goes_to_one_refiner` is
-- unique on lot_id, so a lot stranded on a cancelled order could never be
-- batched again.
DELETE FROM refining.lots WHERE refining_order_id = $1
