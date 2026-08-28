-- The spot price a refiner quoted for one metal on one order.
--
-- NO `ON CONFLICT`, AND THAT IS DELIBERATE - the sibling statement in
-- orders/spots/sql/create.sql has one and this cannot.
--
-- orders.spots carries UNIQUE (order_id, metal_id); refiners.spots does not.
-- Checked against pg_indexes rather than copied across: this table has only its
-- primary key and three plain indexes, so naming a conflict target here raises
-- 42P10 - "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" - which is a runtime error, not a compile-time one.
--
-- The asymmetry is real and outlives this file: nothing stops two rows for the
-- same order and metal. Dev has none today (124 rows, zero duplicate pairs),
-- and exchange.refiner_metals had no such constraint either, so this preserves
-- rather than introduces the gap.
-- refiner_order_id is the ENGAGEMENT link (093), resolved here rather than
-- passed: one engagement per order means the order id determines it, and a
-- caller cannot hand in a mismatched pair.
INSERT INTO refiners.spots (id, order_id, refiner_order_id, metal_id, refiner_id, ask, bid)
VALUES ($1, $2, (SELECT ro.id FROM refiners.orders ro WHERE ro.order_id = $2), $3, $4, $5, $6)
RETURNING id, order_id, refiner_order_id, metal_id, refiner_id, ask, bid
