INSERT INTO payments.feed_cursors (source, cursor, synced_at)
VALUES ($1, $2, now())
ON CONFLICT (source)
DO UPDATE SET cursor = EXCLUDED.cursor, synced_at = EXCLUDED.synced_at, updated_at = now()
RETURNING *
