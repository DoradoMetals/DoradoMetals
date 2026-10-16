-- THE MATCH-SETTLEMENT-LINES READ. $1 = refining_order_id.
--
-- One row per lot the refiner order holds, with the pre-match the dialog's
-- three sections are drawn from. Nothing is written and nothing is parsed
-- here: the refiner's line reference arrives on the lot (262), from Record
-- settlement or from an import, and the match is then a FACT about the rows
-- rather than a guess this read has to make.
--
-- The status is derived, never stored:
--   matched            the line names one of our lots and carries a reference
--   not_on_invoice     one of our lots, with no line on the statement
--   extra_on_invoice   a line the refiner reported that no lot of ours feeds
--   unmatched          neither - a lot nobody has reconciled yet
--
-- A source combined from others has no seat of its own; it is matched through
-- its parents' seats (lot_parents.sql), so `matched_reference` reads
-- `Lot 2481-A + Lot 2481-B` and `matched_parents` lists each one. A released
-- link (rulings 144, 145) is off the order and is not a line.
--
-- `fine_oz` is content x quantity, the same product every other settlement
-- read sums, so the dialog's arithmetic and the order's cannot disagree.
SELECT rl.id,
       rl.lot_id,
       li.line_reference,
       li.metal_id,
       li.unit,
       li.post_melt,
       li.purity,
       (CASE ro.direction WHEN 'buy' THEN 'RP-' ELSE 'RS-' END)
         || ro.number || '-' || chr(64 + rseat.n::int) AS reference,
       CASE WHEN li.content IS NULL THEN NULL ELSE li.content * li.quantity END AS fine_oz,
       src.lot_id AS matched_lot_id,
       src.reference AS matched_reference,
       src.order_reference AS matched_order_reference,
       COALESCE(src.parents, '[]'::jsonb) AS matched_parents,
       CASE WHEN src.lot_id IS NOT NULL AND li.line_reference IS NOT NULL THEN 'matched'
            WHEN src.lot_id IS NOT NULL THEN 'not_on_invoice'
            WHEN li.line_reference IS NOT NULL THEN 'extra_on_invoice'
            ELSE 'unmatched' END AS status
  FROM refining.lots rl
  JOIN refining.orders ro ON ro.id = rl.refining_order_id
  JOIN inventory.lots li ON li.id = rl.lot_id
  LEFT JOIN LATERAL (
         SELECT count(*) AS n
           FROM refining.lots rpeer
          WHERE rpeer.refining_order_id = rl.refining_order_id
            AND (rpeer.created_at, rpeer.id) <= (rl.created_at, rl.id)
       ) rseat ON TRUE
  LEFT JOIN LATERAL (
         SELECT sl.id AS lot_id,
                COALESCE('Lot ' || sod.number || '-' || chr(64 + sseat.n::int),
                         up.reference) AS reference,
                COALESCE((CASE WHEN sod.direction = 'sale' THEN 'SO-' ELSE 'PO-' END)
                           || sod.number, up.order_reference) AS order_reference,
                COALESCE(up.parents, '[]'::jsonb) AS parents
           FROM inventory.lot_sources e
           JOIN inventory.lots sl ON sl.id = e.source_lot_id
           LEFT JOIN orders.lots sol ON sol.lot_id = sl.id
           LEFT JOIN orders.orders sod ON sod.id = sol.order_id
           LEFT JOIN LATERAL (
                  SELECT count(*) AS n
                    FROM orders.lots speer
                   WHERE speer.order_id = sol.order_id
                     AND (speer.created_at, speer.id) <= (sol.created_at, sol.id)
                ) sseat ON TRUE
           LEFT JOIN LATERAL (
                  SELECT jsonb_agg(par.parent ORDER BY par.created_at, par.lot_id) AS parents,
                         string_agg(par.parent ->> 'reference', ' + '
                                    ORDER BY par.created_at, par.lot_id) AS reference,
                         (array_agg(par.parent ->> 'order_reference'
                                    ORDER BY par.created_at, par.lot_id))[1] AS order_reference
                    FROM (/*__lot_parents__*/) par
                   WHERE sol.id IS NULL
                ) up ON TRUE
          WHERE e.lot_id = li.id AND e.kind = 'batch'
            AND (sol.id IS NOT NULL OR up.parents IS NOT NULL)
          ORDER BY e.created_at, e.id
          LIMIT 1
       ) src ON TRUE
 WHERE rl.refining_order_id = $1
   AND rl.released_at IS NULL
 ORDER BY reference ASC
