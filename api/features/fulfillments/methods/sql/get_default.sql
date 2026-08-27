-- The method a direction falls back to when nothing was chosen.
--
-- Every direction has exactly one default per category in the seed. This asks
-- for the default of a NAMED category, because "the default method for a sale"
-- is ambiguous and "the default way to ship a sale" is not.
SELECT
       id, type, label, admin_label, category, direction, enabled, hidden,
       is_default, created_at, updated_at
  FROM fulfillments.methods
 WHERE direction = $1::orders.direction
   AND category = $2
   AND is_default
   AND enabled
 ORDER BY id ASC
 LIMIT 1
