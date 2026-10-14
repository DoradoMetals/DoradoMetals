-- Stamped after the quotes are written. A good tick ends a run of failures:
-- last_error clears and failed_polls returns to 0, which the source_events
-- trigger reads as a recovery (migration 268).
UPDATE spots.sources SET last_tick_at = now(), last_error = NULL, failed_polls = 0 WHERE id = $1
