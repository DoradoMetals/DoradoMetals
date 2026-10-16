-- A SPOT LOCK NAMES WHY IT HAPPENED (ruling 2026-10-14, FOLLOWUPS "Orders: spot
-- locks only for the order's metals"; customer-purchase.md R-1).
--
-- An order locks only the metals it holds. A metal that arrives later - a lot
-- added or edited onto a new metal, an adopted refiner assay - gets its own
-- lock event at that moment, from the step that introduced it, and the row
-- says which step: `reason`. A lock or unlock an admin asked for directly
-- leaves it NULL.
--
-- Purely additive: one nullable column. `exchange` is neither read nor written.

ALTER TABLE orders.spot_locks ADD COLUMN IF NOT EXISTS reason text;
