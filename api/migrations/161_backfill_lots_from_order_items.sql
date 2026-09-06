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
--   content                           NOT copied: it is generated. A catalogue
--                                     lot carries its value in
--                                     content_snapshot instead and comes out
--                                     identical; a scrap lot regenerates from
--                                     its own weights.
--   premium, price, sales_tax_charged, confirmed   to orders.lots
--
-- THE GATE. Measured on dev 2026-09-08, before this ran:
--   * 81 of 81 catalogue lines reproduce their content EXACTLY (snapshot).
--   * 7 of 22 scrap lines reproduce it exactly.
--   * 15 scrap lines differ by ROUNDING ONLY - the largest by 4.75e-4 t oz
--     (line 793cba4f: stored 0.550, generated 0.549525). Their stored content
--     was rounded to three decimals at write time, or was written before 134
--     fixed the gram and pound constants; the generated value is the more
--     precise one and is the correct one. No line moves by more than 1e-3 t oz,
--     and the statement below REFUSES TO COMMIT if one does.

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
       CASE WHEN oi.bullion_id IS NOT NULL THEN oi.content END,
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
BEGIN
  SELECT count(*), COALESCE(max(abs(li.content - oi.content)), 0)
    INTO moved, worst
    FROM lots.items li
    JOIN orders.items oi ON oi.id = li.id
   WHERE li.content IS DISTINCT FROM oi.content;

  IF worst > 1e-3 THEN
    RAISE EXCEPTION
      'a lot content moved by % t oz, which is a price change and not a rounding residue', worst;
  END IF;

  RAISE NOTICE 'lots: % line(s) regenerated their content, worst drift % t oz', moved, worst;
END $$;
