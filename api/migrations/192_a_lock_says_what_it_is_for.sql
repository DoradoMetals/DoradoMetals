-- A POOL LOCK SAYS WHAT IT IS FOR, AND WHAT IT SOURCES.
--
-- `inventory.pool` is append-only: a `credit` adds ounces when a refiner order
-- settles, a `lock` takes them out at an agreed price. The Pool screens ask two
-- things the ledger could not answer - why the metal came out (`Sell to
-- refiner` or `Source a sale`) and, when it sourced a sale, which lot it
-- sourced - so both become columns on the entry.
--
-- `refining_order_id` stops being mandatory with them: a lock that sources a
-- sale cites the sale's lot, not a refiner order. Every existing row has one,
-- so nothing is lost by relaxing it.
--
-- `balance - locked = available` is then a read, not a column: credits sum to
-- the balance, locks sum to what is spoken for, and the difference is what a
-- new sale may draw on.
--
-- `exchange` is neither read nor written.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE n.nspname = 'inventory' AND t.typname = 'lock_purpose') THEN
    CREATE TYPE inventory.lock_purpose AS ENUM ('Sell to refiner', 'Source a sale');
  END IF;
END $$;

ALTER TABLE inventory.pool
  ADD COLUMN IF NOT EXISTS purpose inventory.lock_purpose,
  ADD COLUMN IF NOT EXISTS lot_id uuid;

ALTER TABLE inventory.pool ALTER COLUMN refining_order_id DROP NOT NULL;

UPDATE inventory.pool
   SET purpose = 'Sell to refiner'
 WHERE entry = 'lock' AND purpose IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pool_lot_fk'
                   AND conrelid = 'inventory.pool'::regclass) THEN
    ALTER TABLE inventory.pool ADD CONSTRAINT pool_lot_fk
      FOREIGN KEY (lot_id) REFERENCES inventory.lots(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_lock_says_what_it_is_for'
                   AND conrelid = 'inventory.pool'::regclass) THEN
    ALTER TABLE inventory.pool ADD CONSTRAINT a_lock_says_what_it_is_for
      CHECK ((entry = 'lock'::inventory.pool_entry) = (purpose IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'an_entry_cites_an_order_or_a_lot'
                   AND conrelid = 'inventory.pool'::regclass) THEN
    ALTER TABLE inventory.pool ADD CONSTRAINT an_entry_cites_an_order_or_a_lot
      CHECK (refining_order_id IS NOT NULL OR lot_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pool_lot ON inventory.pool USING btree (lot_id)
  WHERE lot_id IS NOT NULL;

DO $$
DECLARE
  locks bigint;
BEGIN
  SELECT count(*) INTO locks FROM inventory.pool WHERE entry = 'lock';
  RAISE NOTICE 'pool: % lock(s) recorded as Sell to refiner, which is the only purpose the build had before this', locks;
END $$;
