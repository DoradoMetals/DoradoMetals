DELETE FROM refining.orders WHERE id = $1 AND sent_at IS NULL RETURNING id
