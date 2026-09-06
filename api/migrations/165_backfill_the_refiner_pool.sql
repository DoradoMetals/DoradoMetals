-- `pool_oz_deducted` was a single mutable number stored twice - once on the
-- engagement and again on orders.transactions - so a correction overwrote the
-- thing being corrected and nothing said when, why or in which metal. The pool
-- is a ledger now: append-only, signed, per refiner per metal, every entry
-- citing the refining order that caused it.
--
-- Both legacy columns stay where they are and are not read again.
--
-- WHAT THERE IS TO CARRY. Measured on dev 2026-09-08: 16 engagements hold a
-- pool_oz_deducted and 15 of them hold ZERO. One row is real - engagement
-- 18900b4a on purchase order 234, 0.001 t oz deducted against 0.35 remediated -
-- and its lots are all Gold, so the metal the legacy row never recorded is
-- resolvable. A `lock` takes metal out and is negative; the remediation that
-- put it back is a `credit`. An engagement whose lots span more than one metal
-- would have no answer, so the statement below simply does not carry it and the
-- assertion says how many were left behind.
--
-- lock_price is the refiner's price when metal came out and no legacy column
-- ever held one, so the entries are written at the order's own frozen gold bid.

INSERT INTO refining.pool
       (refiner_id, metal_id, entry, troy_oz, lock_price, refining_order_id,
        occurred_at, created_at)
SELECT nro.refiner_id,
       m.metal_id,
       'lock'::refining.pool_entry,
       -ro.pool_oz_deducted,
       (SELECT os.bid FROM orders.spots os
         WHERE os.order_id = ro.order_id AND os.metal_id = m.metal_id),
       nro.id,
       ro.updated_at,
       ro.updated_at
  FROM refiners.orders ro
  JOIN refining.orders nro ON nro.id = ro.id
  JOIN LATERAL (
         SELECT li.metal_id
           FROM refining.lots rl
           JOIN lots.items li ON li.id = rl.lot_id
          WHERE rl.refining_order_id = nro.id
          GROUP BY li.metal_id
         HAVING count(*) >= 0
       ) m ON TRUE
 WHERE ro.pool_oz_deducted > 0
   AND 1 = (SELECT count(DISTINCT li.metal_id)
              FROM refining.lots rl
              JOIN lots.items li ON li.id = rl.lot_id
             WHERE rl.refining_order_id = nro.id)
   AND NOT EXISTS (SELECT 1 FROM refining.pool p
                    WHERE p.refining_order_id = nro.id AND p.entry = 'lock');

INSERT INTO refining.pool
       (refiner_id, metal_id, entry, troy_oz, refining_order_id,
        occurred_at, created_at)
SELECT nro.refiner_id,
       m.metal_id,
       'credit'::refining.pool_entry,
       ro.pool_remediation,
       nro.id,
       ro.updated_at,
       ro.updated_at
  FROM refiners.orders ro
  JOIN refining.orders nro ON nro.id = ro.id
  JOIN LATERAL (
         SELECT li.metal_id
           FROM refining.lots rl
           JOIN lots.items li ON li.id = rl.lot_id
          WHERE rl.refining_order_id = nro.id
          GROUP BY li.metal_id
       ) m ON TRUE
 WHERE ro.pool_remediation > 0
   AND 1 = (SELECT count(DISTINCT li.metal_id)
              FROM refining.lots rl
              JOIN lots.items li ON li.id = rl.lot_id
             WHERE rl.refining_order_id = nro.id)
   AND NOT EXISTS (SELECT 1 FROM refining.pool p
                    WHERE p.refining_order_id = nro.id AND p.entry = 'credit');

DO $$
DECLARE
  unresolved bigint;
BEGIN
  SELECT count(*) INTO unresolved
    FROM refiners.orders ro
    JOIN refining.orders nro ON nro.id = ro.id
   WHERE (ro.pool_oz_deducted > 0 OR ro.pool_remediation > 0)
     AND NOT EXISTS (SELECT 1 FROM refining.pool p WHERE p.refining_order_id = nro.id);

  IF unresolved > 0 THEN
    RAISE NOTICE
      '% engagement(s) hold pool ounces in no single metal and stay in refiners.orders only',
      unresolved;
  END IF;
END $$;
