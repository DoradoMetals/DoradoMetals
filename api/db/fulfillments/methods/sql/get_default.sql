-- The method a direction falls back to when nothing was chosen - the default of a NAMED category, since "the default for a sale" alone is ambiguous.
-- Both parameters are cast to their enum explicitly: an uncast text value that isn't a valid label doesn't fail to match, it raises 22P02 (audit:enum-domains) - the cast makes that coupling visible.
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
