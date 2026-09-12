-- A CREDIT KNOWS WHAT SPOT IT ARRIVED AT, AND A LOCK KNOWS ITS BASIS.
--
-- Ruling 123: order profit values the refiner's assay at the spot ON THE
-- ASSAY DAY, fixed per lot forever. A pool credit is minted at that same
-- moment, so it carries the fine-ounce-weighted average of the settled
-- lots' own settled_spot that fed it - `spot`, meaningful on entry='credit'.
-- A lock draws against a mixed pool, so its cost basis is the pool's own
-- weighted-average credit spot for that refiner and metal AT LOCK TIME,
-- snapshotted once as `basis_spot` so a later credit or lock never moves it -
-- meaningful on entry='lock'.
--
-- Both columns are nullable: a credit minted before this wave settled its
-- lots with no spot recorded at all (pooled orders never stamped one before
-- today), and a lock with no prior credit has no basis to snapshot. Neither
-- is derivable, and both stay NULL rather than guessed.
--
-- `exchange` is neither read nor written.

ALTER TABLE inventory.pool
  ADD COLUMN IF NOT EXISTS spot numeric,
  ADD COLUMN IF NOT EXISTS basis_spot numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pool_credit_carries_the_spot'
                   AND conrelid = 'inventory.pool'::regclass) THEN
    ALTER TABLE inventory.pool ADD CONSTRAINT pool_credit_carries_the_spot
      CHECK (entry = 'credit' OR spot IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pool_lock_carries_the_basis'
                   AND conrelid = 'inventory.pool'::regclass) THEN
    ALTER TABLE inventory.pool ADD CONSTRAINT pool_lock_carries_the_basis
      CHECK (entry = 'lock' OR basis_spot IS NULL);
  END IF;
END $$;

WITH lot_avg AS (
  SELECT rl.refining_order_id, li.metal_id,
         sum(li.content * li.premium * li.quantity)
           FILTER (WHERE li.settled_spot IS NOT NULL) AS weight,
         sum(li.content * li.premium * li.quantity * li.settled_spot)
           FILTER (WHERE li.settled_spot IS NOT NULL) AS weighted
    FROM refining.lots rl
    JOIN inventory.lots li ON li.id = rl.lot_id
   WHERE li.content IS NOT NULL AND li.premium IS NOT NULL
   GROUP BY rl.refining_order_id, li.metal_id
)
UPDATE inventory.pool p
   SET spot = a.weighted / NULLIF(a.weight, 0)
  FROM lot_avg a
 WHERE p.entry = 'credit'
   AND p.spot IS NULL
   AND p.refining_order_id = a.refining_order_id
   AND p.metal_id = a.metal_id
   AND a.weight IS NOT NULL;

WITH lock_basis AS (
  SELECT l.id,
         sum(c.troy_oz * c.spot) / NULLIF(sum(c.troy_oz), 0) AS basis_spot
    FROM inventory.pool l
    JOIN inventory.pool c
      ON c.entry = 'credit'
     AND c.refiner_id = l.refiner_id
     AND c.metal_id = l.metal_id
     AND c.spot IS NOT NULL
     AND (c.occurred_at, c.id) < (l.occurred_at, l.id)
   WHERE l.entry = 'lock'
   GROUP BY l.id
)
UPDATE inventory.pool p
   SET basis_spot = b.basis_spot
  FROM lock_basis b
 WHERE p.id = b.id
   AND p.basis_spot IS NULL
   AND b.basis_spot IS NOT NULL;

DO $$
DECLARE
  credits_total    bigint;
  credits_derived  bigint;
  locks_total      bigint;
  locks_derived    bigint;
BEGIN
  SELECT count(*) INTO credits_total   FROM inventory.pool WHERE entry = 'credit';
  SELECT count(*) INTO credits_derived FROM inventory.pool WHERE entry = 'credit' AND spot IS NOT NULL;
  SELECT count(*) INTO locks_total     FROM inventory.pool WHERE entry = 'lock';
  SELECT count(*) INTO locks_derived   FROM inventory.pool WHERE entry = 'lock' AND basis_spot IS NOT NULL;
  RAISE NOTICE 'pool: % of % credit(s) got a backfilled spot, % of % lock(s) got a backfilled basis_spot',
    credits_derived, credits_total, locks_derived, locks_total;
END $$;
