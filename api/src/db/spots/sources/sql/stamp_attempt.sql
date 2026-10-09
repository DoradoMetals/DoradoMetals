-- Stamped before the provider is called, so a feed that was polled and failed
-- is distinguishable from one that was never polled at all.
UPDATE spots.sources SET last_attempt_at = now() WHERE id = $1
