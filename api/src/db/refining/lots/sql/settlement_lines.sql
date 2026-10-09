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
                'Lot ' || sod.number || '-' || chr(64 + sseat.n::int) AS reference,
                (CASE WHEN sod.direction = 'sale' THEN 'SO-' ELSE 'PO-' END)
                  || sod.number AS order_reference
           FROM inventory.lot_sources e
           JOIN inventory.lots sl ON sl.id = e.source_lot_id
           JOIN orders.lots sol ON sol.lot_id = sl.id
           JOIN orders.orders sod ON sod.id = sol.order_id
          CROSS JOIN LATERAL (
                 SELECT count(*) AS n
                   FROM orders.lots speer
                  WHERE speer.order_id = sol.order_id
                    AND (speer.created_at, speer.id) <= (sol.created_at, sol.id)
               ) sseat
          WHERE e.lot_id = li.id AND e.kind = 'batch'
          ORDER BY e.created_at, e.id
          LIMIT 1
       ) src ON TRUE
 WHERE rl.refining_order_id = $1
 ORDER BY reference ASC
