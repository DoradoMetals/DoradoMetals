-- ONE LINEAGE TABLE (ruling 120). Values in one place, links in another.
--
-- `split_from_id` and `combined_into_id` were two columns answering one
-- question in two directions, and neither could hold the two edges the model
-- needs next: a refiner lot minted from N of ours, and a sale lot minted from
-- a lot we hold.
--
-- `inventory.lot_sources` is that one table. `lot_id` is always the MINTED
-- lot and `source_lot_id` is always what it came from, so every kind reads the
-- same way:
--
--   split    one edge per child, pointing at the parent
--   combine  one edge per parent, pointing at the result
--   batch    one edge per customer lot, pointing at the refiner lot
--   sale     one edge per stock lot, pointing at the sale lot
--
-- The backfill is exact: `split_from_id` is a split edge and
-- `combined_into_id` is a combine edge, and nothing else could be either.
-- `exchange` is neither read nor written.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE n.nspname = 'inventory' AND t.typname = 'lot_source_kind') THEN
    CREATE TYPE inventory.lot_source_kind AS ENUM ('split', 'combine', 'batch', 'sale');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventory.lot_sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lot_id uuid NOT NULL,
  source_lot_id uuid NOT NULL,
  kind inventory.lot_source_kind NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lot_sources_pkey'
                   AND conrelid = 'inventory.lot_sources'::regclass) THEN
    ALTER TABLE inventory.lot_sources ADD CONSTRAINT lot_sources_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lot_sources_lot_fk'
                   AND conrelid = 'inventory.lot_sources'::regclass) THEN
    ALTER TABLE inventory.lot_sources ADD CONSTRAINT lot_sources_lot_fk
      FOREIGN KEY (lot_id) REFERENCES inventory.lots(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lot_sources_source_fk'
                   AND conrelid = 'inventory.lot_sources'::regclass) THEN
    ALTER TABLE inventory.lot_sources ADD CONSTRAINT lot_sources_source_fk
      FOREIGN KEY (source_lot_id) REFERENCES inventory.lots(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_lot_is_not_its_own_source'
                   AND conrelid = 'inventory.lot_sources'::regclass) THEN
    ALTER TABLE inventory.lot_sources ADD CONSTRAINT a_lot_is_not_its_own_source
      CHECK (lot_id <> source_lot_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS one_edge_per_pair_and_kind
  ON inventory.lot_sources USING btree (lot_id, source_lot_id, kind);
CREATE INDEX IF NOT EXISTS lot_sources_lot ON inventory.lot_sources USING btree (lot_id);
CREATE INDEX IF NOT EXISTS lot_sources_source
  ON inventory.lot_sources USING btree (source_lot_id, kind);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON inventory.lot_sources
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

INSERT INTO inventory.lot_sources (lot_id, source_lot_id, kind, created_at, updated_at)
SELECT li.id, li.split_from_id, 'split', li.created_at, li.updated_at
  FROM inventory.lots li
 WHERE li.split_from_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM inventory.lots p WHERE p.id = li.split_from_id)
ON CONFLICT (lot_id, source_lot_id, kind) DO NOTHING;

INSERT INTO inventory.lot_sources (lot_id, source_lot_id, kind, created_at, updated_at)
SELECT li.combined_into_id, li.id, 'combine', li.updated_at, li.updated_at
  FROM inventory.lots li
 WHERE li.combined_into_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM inventory.lots s WHERE s.id = li.combined_into_id)
ON CONFLICT (lot_id, source_lot_id, kind) DO NOTHING;

DO $$
DECLARE
  splits bigint;
  combines bigint;
  orphans bigint;
BEGIN
  SELECT count(*) FILTER (WHERE kind = 'split'),
         count(*) FILTER (WHERE kind = 'combine')
    INTO splits, combines
    FROM inventory.lot_sources;
  SELECT count(*) INTO orphans FROM inventory.lots li
   WHERE (li.split_from_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM inventory.lots p WHERE p.id = li.split_from_id))
      OR (li.combined_into_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM inventory.lots s WHERE s.id = li.combined_into_id));
  RAISE NOTICE 'lot_sources: % split edge(s), % combine edge(s), % lot(s) pointed at a row that does not exist',
    splits, combines, orphans;
END $$;

ALTER TABLE inventory.lots DROP CONSTRAINT IF EXISTS a_lot_is_not_its_own_parent;
ALTER TABLE inventory.lots DROP CONSTRAINT IF EXISTS a_lot_is_not_its_own_successor;
ALTER TABLE inventory.lots DROP COLUMN IF EXISTS split_from_id;
ALTER TABLE inventory.lots DROP COLUMN IF EXISTS combined_into_id;
