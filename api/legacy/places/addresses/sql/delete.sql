-- Mirror of sql/delete.sql, scoped by owner as exchange's delete always was.
DELETE FROM exchange.addresses WHERE id = $1 AND user_id = $2
