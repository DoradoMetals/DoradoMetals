-- The method a direction falls back to when nothing was chosen.
--
-- Every direction has exactly one default per category in the seed. This asks
-- for the default of a NAMED category, because "the default method for a sale"
-- is ambiguous and "the default way to ship a sale" is not.
--
-- BOTH parameters are cast to their enum explicitly. `category` became
-- fulfillments.category in migration 098, and a text parameter compared against
-- an enum column is coerced by Postgres - a value that is not a label does not
-- fail to match, it raises 22P02 and the whole call throws. That is
-- audit:enum-domains' subject exactly (D39), and the cast is what makes the
-- coupling visible to a reader instead of implicit in the planner.
SELECT
       id, type, label, admin_label, category, direction, enabled, hidden,
       is_default, created_at, updated_at
  FROM fulfillments.methods
 WHERE direction = $1::orders.direction
   AND category = $2::fulfillments.category
   AND is_default
   AND enabled
 ORDER BY id ASC
 LIMIT 1
