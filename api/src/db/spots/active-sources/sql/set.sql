-- One active source per metal (section 3 answer 4: per metal, not per side), so
-- the write is an upsert on the metal. The adjustment_history trigger logs the
-- switch; this statement records no actor of its own.
INSERT INTO spots.active_sources (metal_id, source_id)
VALUES ($1, $2)
ON CONFLICT (metal_id) DO UPDATE SET source_id = EXCLUDED.source_id
RETURNING metal_id
