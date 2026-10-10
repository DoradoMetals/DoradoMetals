-- runs-even-under-a-baseline: it re-adds the eleven columns 188, 190 and 191
--   drop, which genesis therefore no longer creates and which 160 to 179 still
--   write on their way to the lot. 160 carries rows, so a baseline replays it,
--   and its foreign key on inventory.lots.split_from_id aborts the chain with
--   "column split_from_id referenced in foreign key constraint does not exist"
--   the moment this file is stamped instead of run. Measured 2026-10-09 on the
--   production dump, with the range at 002-265.
--
-- THE COLUMNS THE REBUILD STILL WRITES.
--
-- 188, 190 and 191 drop eleven columns whose values moved onto the lot, so
-- genesis - which is dumped from dev - stops creating them. The chain from 160
-- to 179 still writes every one of them on its way there: 161 fills
-- `orders.lots`'s four money columns from `orders.items`, 163 fills
-- `refining.lots`'s figures from the refiner's own line, 165 and 169 read
-- them, and 179 indexes `split_from_id`.
--
-- 160 would have created them, but 160 creates its tables `IF NOT EXISTS` and
-- in a build from nothing genesis got there first. So they are re-added here,
-- one statement before 160, and dropped again in their own place.
--
-- Against dev and every database built before 188 this file is a no-op.
-- `exchange` is neither read nor written.

DO $$
BEGIN
  IF to_regclass('inventory.lots') IS NOT NULL THEN
    ALTER TABLE inventory.lots ADD COLUMN IF NOT EXISTS split_from_id uuid;
  END IF;

  IF to_regclass('orders.lots') IS NOT NULL THEN
    ALTER TABLE orders.lots
      ADD COLUMN IF NOT EXISTS premium numeric,
      ADD COLUMN IF NOT EXISTS price numeric,
      ADD COLUMN IF NOT EXISTS sales_tax_charged numeric DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS confirmed boolean DEFAULT false NOT NULL;
  END IF;

  IF to_regclass('refining.lots') IS NOT NULL THEN
    ALTER TABLE refining.lots
      ADD COLUMN IF NOT EXISTS unit text DEFAULT 't oz'::text NOT NULL,
      ADD COLUMN IF NOT EXISTS pre_melt numeric,
      ADD COLUMN IF NOT EXISTS post_melt numeric,
      ADD COLUMN IF NOT EXISTS purity numeric,
      ADD COLUMN IF NOT EXISTS premium numeric,
      ADD COLUMN IF NOT EXISTS settled_at timestamp with time zone;
    ALTER TABLE refining.lots
      ADD COLUMN IF NOT EXISTS content numeric GENERATED ALWAYS AS
        (metals.fine_content(COALESCE(post_melt, pre_melt), unit, purity)) STORED;
  END IF;
END $$;
