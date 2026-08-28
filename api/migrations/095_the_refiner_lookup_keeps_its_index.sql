-- The access path 094's column move would have silently lost.
--
-- exchange indexes sales_orders.supplier_id (idx_sales_orders_supplier_id) -
-- the "which orders went to this refinery" lookup. That value lives on the
-- engagement now (refiners.orders.refiner_id, 093/094), and nothing there led
-- with refiner_id, which is exactly the class of loss audit:indexes exists to
-- catch: no error, no wrong rows, just a sequential scan waiting for
-- production row counts. Found by that audit the same session as the drop.
CREATE INDEX IF NOT EXISTS refiners_orders_refiner_id_idx
  ON refiners.orders (refiner_id);
