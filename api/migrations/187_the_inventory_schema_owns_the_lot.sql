-- ONE LOTS TABLE, ONE POOL, ONE SCHEMA THAT OWNS BOTH (ruling 120).
--
-- `lots.items` becomes `inventory.lots` and `refining.pool` becomes
-- `inventory.pool`. The `inventory` domain already exists (ruling 113); this
-- gives it the schema its tables belong in, so `db/inventory/` reads the
-- schema it is named for like every other folder under `db/`.
--
-- A rename keeps every row, every index and every trigger. What it does NOT
-- keep is their NAMES, so they are renamed here too - a dump of dev is the
-- committed genesis, and `lots_items_pkey` on `inventory.lots` would be read
-- for years as evidence of a table that no longer exists.
--
-- The two stamp functions live in the `lots` schema and move with the table.
-- `exchange` is neither read nor written.

CREATE SCHEMA IF NOT EXISTS inventory;

DO $$
BEGIN
  IF to_regclass('lots.items') IS NOT NULL THEN
    ALTER TABLE lots.items SET SCHEMA inventory;
    ALTER TABLE inventory.items RENAME TO lots;
  END IF;

  IF to_regclass('refining.pool') IS NOT NULL THEN
    ALTER TABLE refining.pool SET SCHEMA inventory;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
              WHERE n.nspname = 'refining' AND t.typname = 'pool_entry') THEN
    ALTER TYPE refining.pool_entry SET SCHEMA inventory;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'lots' AND p.proname = 'declare_stamp') THEN
    ALTER FUNCTION lots.declare_stamp() SET SCHEMA inventory;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'lots' AND p.proname = 'assay_stamp') THEN
    ALTER FUNCTION lots.assay_stamp() SET SCHEMA inventory;
  END IF;
END $$;

DO $$
DECLARE
  pair record;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('inventory.lots', 'lots_items_pkey',      'lots_pkey'),
      ('inventory.lots', 'lots_items_bullion_fk','lots_bullion_fk'),
      ('inventory.lots', 'lots_items_image_fk',  'lots_image_fk'),
      ('inventory.lots', 'lots_items_metal_fk',  'lots_metal_fk'),
      ('inventory.lots', 'lots_items_split_fk',  'lots_split_fk'),
      ('inventory.pool', 'refining_pool_pkey',       'pool_pkey'),
      ('inventory.pool', 'refining_pool_metal_fk',   'pool_metal_fk'),
      ('inventory.pool', 'refining_pool_order_fk',   'pool_order_fk'),
      ('inventory.pool', 'refining_pool_refiner_fk', 'pool_refiner_fk')
    ) AS v(rel, old, new)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = pair.old AND conrelid = pair.rel::regclass) THEN
      EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', pair.rel, pair.old, pair.new);
    END IF;
  END LOOP;

  FOR pair IN
    SELECT * FROM (VALUES
      ('inventory', 'lots_items_bullion',   'lots_bullion'),
      ('inventory', 'lots_items_metal',     'lots_metal'),
      ('inventory', 'lots_items_split',     'lots_split'),
      ('inventory', 'items_split_from_idx', 'lots_split_from_idx'),
      ('inventory', 'items_combined_into_idx', 'lots_combined_into_idx')
    ) AS v(nsp, old, new)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = pair.nsp AND c.relname = pair.old AND c.relkind = 'i') THEN
      EXECUTE format('ALTER INDEX %I.%I RENAME TO %I', pair.nsp, pair.old, pair.new);
    END IF;
  END LOOP;
END $$;

DROP SCHEMA IF EXISTS lots RESTRICT;

DO $$
DECLARE
  lots_n bigint;
  pool_n bigint;
BEGIN
  SELECT count(*) INTO lots_n FROM inventory.lots;
  SELECT count(*) INTO pool_n FROM inventory.pool;
  RAISE NOTICE 'inventory: % lot(s) and % pool entr(ies) carried over; schema lots is gone',
    lots_n, pool_n;
END $$;
