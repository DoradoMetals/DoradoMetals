-- One product's id, by its exact name.
--
-- THE CALLER IS /quotes/purchase_order, and it needs a products.bullion id
-- specifically, because every downstream step (getLiveness, getByIds) reads
-- this table. It used to ask features/checkout's repo.next for this - a direct
-- import around the repo.js that CHECKOUT_SOURCE selects (D142), which meant a
-- switch could report `exchange` while the read went to the new schema anyway.
-- Asking the feature that OWNS the table removes the bypass rather than routing
-- it: there is no longer a second implementation to be inconsistent with.
--
-- `name` is not unique on this table, hence LIMIT 1. That matches what the
-- checkout statements it replaces did, and the ordering is left to the planner
-- for the same reason - narrowing it here would be a behaviour change dressed
-- as a relocation.
SELECT id
  FROM products.bullion
 WHERE name = $1
 LIMIT 1
