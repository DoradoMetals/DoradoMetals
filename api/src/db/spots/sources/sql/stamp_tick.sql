-- Stamped after the quotes are written. last_error clears on a good tick.
UPDATE spots.sources SET last_tick_at = now(), last_error = NULL WHERE id = $1
