-- Mirror of sql/delete.sql, scoped to the owner for the same reason.
DELETE FROM exchange.images WHERE id = $1 AND user_id = $2
