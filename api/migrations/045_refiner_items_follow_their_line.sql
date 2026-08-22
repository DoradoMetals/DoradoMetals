-- A refiner's line should not outlive the order line it describes.
--
-- refiners.items.order_item_id references orders.items ON DELETE RESTRICT, so
-- deleting an order line fails while a refiner row points at it. exchange has
-- no equivalent constraint - its refiner data is exchange.refiner_metals, keyed
-- by order rather than by line - so deleting a line works there and does not
-- here. Found by the dual-write test for deleteOrderItems, which is exactly the
-- kind of difference that only shows up when something tries to do it.
--
-- RESTRICT is the wrong rule for what this row is. refiners.items is a refiner's
-- view of a specific line: what they assayed, what they paid for it. If the
-- line is removed from the order, the refiner's record of that line describes
-- something that no longer exists.
--
-- CASCADE rather than SET NULL, because a refiners.items row with no
-- order_item_id is not a refiner's view of anything - it is an orphan that
-- would sit in the table forever with nothing able to interpret it.
--
-- Nothing is deleted by this migration; it only changes what happens when an
-- order line is deleted in future. exchange is untouched.

ALTER TABLE refiners.items
  DROP CONSTRAINT refiners_items_order_item_id_fk;

ALTER TABLE refiners.items
  ADD CONSTRAINT refiners_items_order_item_id_fk
  FOREIGN KEY (order_item_id) REFERENCES orders.items(id) ON DELETE CASCADE;
