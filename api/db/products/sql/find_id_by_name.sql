-- One product's id, by its exact name — called by /quotes/purchase_order, whose downstream steps (getLiveness, getByIds) need a products.bullion id.
-- `name` is not unique on this table, hence LIMIT 1; ordering is left to the planner deliberately.
SELECT id
  FROM products.bullion
 WHERE name = $1
 LIMIT 1
