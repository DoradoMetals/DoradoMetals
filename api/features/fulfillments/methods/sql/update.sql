-- Availability and wording only.
--
-- type, category and direction are what the code dispatches on and are
-- deliberately NOT updatable: changing a method's category would move existing
-- fulfillments to a detail table their rows are not in.
--
-- COALESCE rather than a built statement, so a partial update leaves the rest
-- alone - which is what every admin toggle sends. A `false` still lands,
-- because the parameter is only null when the caller omitted the field.
--
-- THERE IS NO create AND NO delete HERE, DELIBERATELY. The three categories are
-- code rather than data: each names the table that carries its detail, and a
-- method of category 'COURIER' would be a fulfillment nothing can complete,
-- because no table holds a courier's details and no code reads one. Turning
-- Pickup off for a week is reference data changing; inventing a category is a
-- row that looks like a feature and is not.
UPDATE fulfillments.methods
   SET label         = coalesce($2, label),
       admin_label   = coalesce($3, admin_label),
       enabled       = coalesce($4, enabled),
       hidden        = coalesce($5, hidden),
       updated_at    = now(),
       updated_by_id = coalesce($6, updated_by_id)
 WHERE id = $1
RETURNING
          id, type, label, admin_label, category, direction, enabled, hidden,
          is_default, created_at, updated_at
