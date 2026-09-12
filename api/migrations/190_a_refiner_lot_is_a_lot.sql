-- THE REFINER'S FIGURES ARE A LOT ROW TOO (ruling 120).
--
-- Batching MINTS a refiner lot per customer lot - a copy of our figures at
-- that moment, to be overwritten by what the refiner reports - and joins it to
-- ours with a `batch` edge. `refining.lots` keeps the link and nothing else:
-- its unit, weights, purity, content, premium and settled_at all move onto the
-- lot it now points at.
--
-- There is no kind column. A lot reached through `refining.lots` IS a refiner
-- lot; that is the whole test, and it is what keeps inventory from counting
-- the same metal twice.
--
-- Two things come with it:
--
--   settled_spot     on the lot (189). Spots are per pricing event: a partial
--                    settlement stamps only the lots it settles.
--   settlement_type  on the refiner order. `paid` means the refiner pays at
--                    settlement and the settled spots price it; `pooled` means
--                    no spot anywhere and the settled content credits
--                    `inventory.pool`, to be priced later by a lock. The
--                    default is `pooled`, which is what the build does today:
--                    settling a sell order writes `inventory.pool` credits and
--                    `refining.order_money` values them at the refiner's last
--                    lock price.
--
-- The mint runs one row at a time so each minted lot is correlated to its own
-- link with certainty rather than by trusting the order of a RETURNING set.
-- Re-running is a no-op: a link whose lot already carries a `batch` edge has
-- been converted.
--
-- `exchange` is neither read nor written.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE n.nspname = 'refining' AND t.typname = 'settlement_type') THEN
    CREATE TYPE refining.settlement_type AS ENUM ('paid', 'pooled');
  END IF;
END $$;

ALTER TABLE refining.orders
  ADD COLUMN IF NOT EXISTS settlement_type refining.settlement_type
    DEFAULT 'pooled'::refining.settlement_type NOT NULL;

DROP VIEW IF EXISTS refining.order_money;

DO $$
DECLARE
  r record;
  new_id uuid;
  minted bigint := 0;
  reported bigint := 0;
BEGIN
  FOR r IN
    SELECT rl.id, rl.lot_id, rl.unit, rl.pre_melt, rl.post_melt, rl.purity,
           rl.premium, rl.settled_at, rl.created_at, rl.updated_at,
           li.bullion_id, li.metal_id, li.quantity, li.image_id,
           li.unit AS our_unit, li.pre_melt AS our_pre_melt,
           li.post_melt AS our_post_melt, li.purity AS our_purity
      FROM refining.lots rl
      JOIN inventory.lots li ON li.id = rl.lot_id
     WHERE NOT EXISTS (SELECT 1 FROM inventory.lot_sources s
                        WHERE s.lot_id = rl.lot_id AND s.kind = 'batch')
     ORDER BY rl.id
  LOOP
    INSERT INTO inventory.lots
           (bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
            image_id, premium, settled_at, created_at, updated_at)
    VALUES (r.bullion_id, r.metal_id, COALESCE(r.unit, r.our_unit), r.quantity,
            r.our_pre_melt, r.our_post_melt, r.our_purity,
            r.image_id, r.premium, r.settled_at, r.created_at, r.updated_at)
    RETURNING id INTO new_id;

    INSERT INTO inventory.lot_sources (lot_id, source_lot_id, kind, created_at, updated_at)
    VALUES (new_id, r.lot_id, 'batch', r.created_at, r.updated_at)
    ON CONFLICT (lot_id, source_lot_id, kind) DO NOTHING;

    IF (r.pre_melt IS NOT NULL AND r.pre_melt IS DISTINCT FROM r.our_pre_melt)
       OR (r.post_melt IS NOT NULL AND r.post_melt IS DISTINCT FROM r.our_post_melt)
       OR (r.purity IS NOT NULL AND r.purity IS DISTINCT FROM r.our_purity) THEN
      UPDATE inventory.lots
         SET pre_melt = COALESCE(r.pre_melt, r.our_pre_melt),
             post_melt = COALESCE(r.post_melt, r.our_post_melt),
             purity = COALESCE(r.purity, r.our_purity)
       WHERE id = new_id;
      reported := reported + 1;
    END IF;

    UPDATE refining.lots SET lot_id = new_id WHERE id = r.id;
    minted := minted + 1;
  END LOOP;

  RAISE NOTICE 'refiner lots: % minted from % link(s); % carried a figure the customer lot did not',
    minted, minted, reported;
END $$;

ALTER TABLE refining.lots DROP CONSTRAINT IF EXISTS settled_lots_carry_a_premium;

ALTER TABLE refining.lots
  DROP COLUMN IF EXISTS content,
  DROP COLUMN IF EXISTS pre_melt,
  DROP COLUMN IF EXISTS post_melt,
  DROP COLUMN IF EXISTS purity,
  DROP COLUMN IF EXISTS unit,
  DROP COLUMN IF EXISTS premium,
  DROP COLUMN IF EXISTS settled_at;

-- The refiner order's money follows its lots. `expected_settlement` is the sum
-- over the refiner lots of content x quantity x premium x the spot that lot was
-- priced at - its own `settled_spot` once Record settlement stamped it, the
-- live bid before that. A `pooled` sell order has no spot on it or on any of
-- its lots, so it has no expected settlement: what it yields is ounces, and a
-- pool lock prices them later.
CREATE OR REPLACE VIEW refining.order_money AS
 SELECT ro.id AS refining_order_id,
    settle.money AS expected_settlement,
    ro.fee,
    rem.remediation AS pool_remediation,
    chg.charge AS payment_charge,
        CASE
            WHEN ro.direction = 'sell'::refining.direction THEN COALESCE(settle.money, 0::numeric) - COALESCE(ro.fee, 0::numeric) - COALESCE(rem.remediation, 0::numeric) - COALESCE(chg.charge, 0::numeric)
            ELSE COALESCE(settle.money, 0::numeric) + COALESCE(ro.fee, 0::numeric) + COALESCE(chg.charge, 0::numeric)
        END AS total
   FROM refining.orders ro
     LEFT JOIN LATERAL ( SELECT sum(rlot.content * rlot.quantity * COALESCE(rlot.premium, src.premium, 1::numeric) * COALESCE(rlot.settled_spot, sp.bid, sp.ask)) AS money
           FROM refining.lots rl
             JOIN inventory.lots rlot ON rlot.id = rl.lot_id
             LEFT JOIN LATERAL ( SELECT s.premium
                   FROM inventory.lot_sources e
                     JOIN inventory.lots s ON s.id = e.source_lot_id
                  WHERE e.lot_id = rlot.id AND e.kind = 'batch'::inventory.lot_source_kind
                  ORDER BY e.created_at, e.id
                 LIMIT 1) src ON true
             LEFT JOIN spots.spots sp ON sp.metal_id = rlot.metal_id
          WHERE rl.refining_order_id = ro.id
            AND (ro.direction <> 'sell'::refining.direction OR ro.settlement_type = 'paid'::refining.settlement_type)) settle ON true
     LEFT JOIN LATERAL ( SELECT - sum(p.troy_oz * p.lock_price) AS remediation
           FROM inventory.pool p
          WHERE p.refining_order_id = ro.id AND p.entry = 'lock'::inventory.pool_entry AND p.lock_price IS NOT NULL) rem ON true
     LEFT JOIN LATERAL ( SELECT max(m.flat_fee) AS charge
           FROM payments.transfers t
             JOIN payments.methods m ON m.type = t.rail::text AND m.enabled
          WHERE t.refining_order_id = ro.id AND t.state <> 'Failed'::payments.transfer_state) chg ON true;
