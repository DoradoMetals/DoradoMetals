-- 161 was corrected after it had already run on dev, and a migration the runner
-- has recorded never runs again. This file is the corrected part of 161 applied
-- to a database that has it, guarded so that it is a no-op where 161 already
-- produced the right rows.
--
-- WHAT WAS WRONG: 161 generated EVERY scrap lot's content from its weights and
-- refused to commit if any lot moved more than 1e-3 t oz from the content its
-- order line stored. On dev no lot moved that far, so it committed; on the
-- production-shaped copy `chain6` it ABORTED THE WHOLE CHAIN on one line -
-- 2f531d4a-b9f0-40d1-b536-21322d2e5544, purchase order 270, silver, whose
-- content 0.257 is 2.010e-3 below the 0.259010 its post-melt and purity derive.
-- That line is not a rounding residue and it is not fixable here: its content
-- was computed from a purity of ~0.058542 that `exchange.scrap.purity
-- numeric(4,3)` then rounded UP to 0.059, and the customer was PAID on 0.257.
--
-- THE RULE 161 NOW ENCODES, and this file brings dev to: a lot on an order that
-- has been SETTLED carries the content it was priced and paid on, as a
-- snapshot, because re-deriving it re-prices history. A lot on an OPEN order
-- generates its content from its own weights, because it can still be
-- re-weighed. "Settled" is read off facts and never off a status (ruling 2):
-- `spots_locked` AND the order's transaction carries a total, which is exactly
-- `rules.isFinalized`.
--
-- `a_snapshot_belongs_to_a_product` has to go with it. It CHECKed
-- `content_snapshot IS NULL OR bullion_id IS NOT NULL`, which was the old rule
-- that only a catalogue lot has a fixed content. A CHECK cannot see whether the
-- lot's order is finalized, so the half that is still true - that no LIVE path
-- writes a scrap lot's snapshot - is pinned by
-- `db/lots/items/tests/repo.test.ts` instead. 160 no longer adds it.
--
-- Reversible: re-add the constraint after clearing every scrap lot's
-- content_snapshot; the lots' content then regenerates from their weights.
--
-- See `docs/waves/lots-backfill-production.md`.

ALTER TABLE inventory.lots DROP CONSTRAINT IF EXISTS a_snapshot_belongs_to_a_product;

UPDATE inventory.lots li
   SET content_snapshot = oi.content
  FROM orders.items oi
  JOIN orders.orders o ON o.id = oi.order_id
 WHERE oi.id = li.id
   AND li.bullion_id IS NULL
   AND li.content_snapshot IS NULL
   AND oi.content IS NOT NULL
   AND o.spots_locked
   AND EXISTS (SELECT 1 FROM orders.transactions t
                WHERE t.order_id = o.id AND t.total IS NOT NULL);

DO $$
DECLARE
  settled bigint;
  over bigint;
  offenders text;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE abs(d.v - li.content_snapshot) > 1e-3),
         COALESCE(string_agg(li.id::text, ', ')
                  FILTER (WHERE abs(d.v - li.content_snapshot) > 1e-3), 'none')
    INTO settled, over, offenders
    FROM inventory.lots li
    CROSS JOIN LATERAL (
      SELECT metals.fine_content(COALESCE(li.post_melt, li.pre_melt), li.unit, li.purity)
    ) AS d(v)
   WHERE li.bullion_id IS NULL
     AND li.content_snapshot IS NOT NULL;

  RAISE NOTICE 'lots: % settled scrap lot(s) keep what was paid; % beyond 1e-3 from their derivation: %',
    settled, over, offenders;
END $$;
