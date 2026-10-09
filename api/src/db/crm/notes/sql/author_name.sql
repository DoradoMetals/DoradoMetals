-- The note's byline, derived in SQL from the audit column the trigger
-- stamps (created_by_id) rather than carried on the row itself. No table
-- alias is assumed, so this substitutes into a plain SELECT and into an
-- UPDATE ... RETURNING alike.
(SELECT a.name FROM auth.users a WHERE a.id = created_by_id)
