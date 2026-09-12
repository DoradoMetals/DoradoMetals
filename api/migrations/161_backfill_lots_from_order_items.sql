-- Every order line becomes a lot, KEEPING ITS ID, and an orders.lots link row
-- carrying the money. Nothing is dropped; orders.items keeps every row it has.
--
-- WHAT MOVES AND WHAT DOES NOT.
--   pre_melt, purity, unit, quantity  copied
--   post_melt                         copied for a scrap lot; NULLED for a
--                                     catalogue lot, where migration 120 had
--                                     filled it with the product's FINE
--                                     content beside its purity - a gross
--                                     column holding a fine weight, which is
--                                     what made a derived content apply purity
--                                     twice. 81 dev rows.
--   content                           SNAPSHOTTED or GENERATED, by whether the
--                                     order has been settled - see below.
--   premium, price, sales_tax_charged, confirmed   to orders.lots
--
-- WHICH CONTENT IS THE TRUTH, AND IT IS NOT THE SAME ANSWER FOR EVERY LOT.
--
-- A CATALOGUE lot snapshots `products.bullion.content`, the ADVERTISED FINE
-- content (ruling 51). Deriving it would apply purity a second time.
--
-- A SETTLED lot snapshots the content the line was PRICED AND PAID ON. An
-- order that has been finalized is a fact: the payout was computed from that
-- number, the invoice printed it, and re-deriving it - even by a rounding
-- residue - re-prices history. "Settled" is read the way the API reads it,
-- off facts and never off a status (ruling 2): `rules.isFinalized` is
-- `spots_locked AND the transaction carries a total`, and that is the
-- predicate below.
--
-- AN OPEN lot GENERATES its content from its own weights through
-- `metals.fine_content`, the one definition (review finding 4). It can still
-- be re-weighed, re-assayed and re-priced, so the derivation is the truth and
-- the stored value is only a cache of it.
--
-- THE GATE, and why it is narrower than it was. It used to assert the WHOLE
-- population against the derivation and refuse above 1e-3 t oz. Measured on
-- the production-shaped copy `chain6` (2026-09-11) that refuses to commit:
--   * 21 of 21 catalogue lines reproduce their content exactly (snapshot).
--   * 82 scrap lines, of which 81 satisfy `stored = round(derived, 3)` exactly
--     - `exchange.scrap.content` is numeric(20,3), so every one of them IS the
--     derivation, rounded at write time. Worst residue 5.00e-4 t oz.
--   * ONE does not, and it is a real defect on a settled order:
--     line 2f531d4a-b9f0-40d1-b536-21322d2e5544 on purchase order 270, silver,
--     4.390 t oz post-melt at purity 0.059, content 0.257 where the derivation
--     says 0.259010 - a move of 2.010e-3. The content was computed from a
--     purity of ~0.058542 which `exchange.scrap.purity numeric(4,3)` then
--     rounded UP to 0.059. The money was paid on 0.257.
-- Snapshotting a settled lot makes that row a NOTICE instead of an abort - it
-- is recorded, and it is never rewritten. The EXCEPTION now guards the lots
-- that can still be re-priced, which is where a derivation disagreeing with
-- its stored value is a live defect rather than history.
-- See `docs/waves/lots-backfill-production.md`.

INSERT INTO lots.items
       (id, bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
        content_snapshot, created_at, updated_at)
SELECT oi.id,
       oi.bullion_id,
       oi.metal_id,
       COALESCE(oi.unit, 't oz'),
       COALESCE(oi.quantity, 1),
       oi.pre_melt,
       CASE WHEN oi.bullion_id IS NULL THEN oi.post_melt END,
       oi.purity,
       CASE
         WHEN oi.bullion_id IS NOT NULL THEN oi.content
         WHEN o.spots_locked
          AND EXISTS (SELECT 1 FROM orders.transactions t
                       WHERE t.order_id = o.id AND t.total IS NOT NULL)
         THEN oi.content
       END,
       o.created_at,
       o.updated_at
  FROM orders.items oi
  JOIN orders.orders o ON o.id = oi.order_id
 WHERE NOT EXISTS (SELECT 1 FROM lots.items li WHERE li.id = oi.id);

INSERT INTO orders.lots
       (order_id, lot_id, premium, price, sales_tax_charged, confirmed,
        created_at, updated_at)
SELECT oi.order_id,
       oi.id,
       oi.premium,
       oi.price,
       oi.sales_tax_charged,
       oi.confirmed,
       o.created_at,
       o.updated_at
  FROM orders.items oi
  JOIN orders.orders o ON o.id = oi.order_id
 WHERE NOT EXISTS (SELECT 1 FROM orders.lots ol WHERE ol.lot_id = oi.id);

DO $$
DECLARE
  moved bigint;
  worst numeric;
  settled bigint;
  settled_moved bigint;
  settled_worst numeric;
  settled_over bigint;
  offenders text;
BEGIN
  -- The lots that can still be re-priced. Their content is generated, so the
  -- stored value has to agree with the derivation or one of the two is wrong.
  SELECT count(*), COALESCE(max(abs(li.content - oi.content)), 0)
    INTO moved, worst
    FROM lots.items li
    JOIN orders.items oi ON oi.id = li.id
   WHERE li.content_snapshot IS NULL
     AND li.content IS DISTINCT FROM oi.content;

  IF worst > 1e-3 THEN
    RAISE EXCEPTION
      'an OPEN lot content moved by % t oz, which is a price change and not a rounding residue', worst;
  END IF;

  -- The settled scrap lots, which carry what was paid. Nothing moved, by
  -- construction - so report what the derivation WOULD have said, and name
  -- every row it disagrees with by more than the gate's tolerance. Those are
  -- recorded here and in docs/waves/lots-backfill-production.md, and rewriting
  -- one would re-price an order that has already been paid.
  SELECT count(*),
         count(*) FILTER (WHERE d.v IS DISTINCT FROM li.content_snapshot),
         COALESCE(max(abs(d.v - li.content_snapshot)), 0),
         count(*) FILTER (WHERE abs(d.v - li.content_snapshot) > 1e-3),
         COALESCE(string_agg(li.id::text || ' (' ||
                             to_char(abs(d.v - li.content_snapshot), 'FM0.999999') || ' t oz)',
                             ', ') FILTER (WHERE abs(d.v - li.content_snapshot) > 1e-3), 'none')
    INTO settled, settled_moved, settled_worst, settled_over, offenders
    FROM lots.items li
    CROSS JOIN LATERAL (
      SELECT metals.fine_content(COALESCE(li.post_melt, li.pre_melt), li.unit, li.purity)
    ) AS d(v)
   WHERE li.bullion_id IS NULL
     AND li.content_snapshot IS NOT NULL;

  RAISE NOTICE 'lots: % open lot(s) regenerated their content, worst drift % t oz', moved, worst;
  RAISE NOTICE 'lots: % settled scrap lot(s) keep what was paid; the derivation would have moved %, worst % t oz, % beyond 1e-3: %',
    settled, settled_moved, settled_worst, settled_over, offenders;
END $$;
