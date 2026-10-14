-- A FEED EVENT IS STAMPED WHEN IT HAPPENS, AND A METAL'S LOCKS HAVE AN ACCESS PATH.
--
-- spots.source_events (migration 268) defaulted created_at to now(), which is
-- the start of the TRANSACTION. One UPDATE can log two events (turned off and
-- made the default), and the feed's failure and recovery can land in one
-- transaction, so rows that happened in order tied on created_at and the
-- metal page Activity, newest first, drew them in uuid order. clock_timestamp()
-- is the moment of the INSERT, which is what audit_stamp already stamps.
--
-- orders.spot_locks is read by metal now - the lock list's metal filter and
-- the metal page Activity - and was indexed only on order_id and created_at.
--
-- `exchange` is neither read nor written.

ALTER TABLE spots.source_events ALTER COLUMN created_at SET DEFAULT clock_timestamp();

CREATE INDEX IF NOT EXISTS spot_locks_metal_id_created_at_idx
  ON orders.spot_locks (metal_id, created_at DESC);
