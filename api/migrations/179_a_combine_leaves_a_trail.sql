-- A split records `split_from_id` on the CHILD. A combine is the reverse and
-- had no column at all, which `docs/design/orders-lots-proposal.md` §5.5 left
-- open and `docs/design/statuses.md` §4 recommends closing this way:
-- `combined_into_id` on the PARENTS, mirroring `split_from_id`.
--
-- The alternative - re-reading `split_from_id` as "this lot's successor" -
-- makes one column mean two opposite things depending on which way you read it,
-- and `content` is a generated column, so a wrong answer double-counts fine
-- ounces in the pool.
--
-- A parent that has been combined is `consumed`, exactly as a parent that has
-- been split is. That is the whole of what the column does; nothing reprices.
--
-- Additive. `exchange` is neither read nor written.

ALTER TABLE inventory.lots
  ADD COLUMN IF NOT EXISTS combined_into_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lots_combined_into_fk') THEN
    ALTER TABLE inventory.lots ADD CONSTRAINT lots_combined_into_fk
      FOREIGN KEY (combined_into_id) REFERENCES inventory.lots(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_lot_is_not_its_own_successor') THEN
    ALTER TABLE inventory.lots ADD CONSTRAINT a_lot_is_not_its_own_successor
      CHECK (combined_into_id IS NULL OR combined_into_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS lots_combined_into_idx
  ON inventory.lots (combined_into_id)
  WHERE combined_into_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lots_split_from_idx
  ON inventory.lots (split_from_id)
  WHERE split_from_id IS NOT NULL;
