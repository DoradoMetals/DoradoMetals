-- Ruling 121: a bullion lot sold from stock MINTS a sale lot. The mint is a
-- copy of the stock lot's own figures at this moment, and a `sale` edge in
-- inventory.lot_sources ties it back to the stock lot it came from - so the
-- stock lot itself is never touched (or sold twice) and the sale prices
-- independently from here on, the same shape `189_the_lot_carries_what_it_prices`
-- used to mint a sale lot for a lot that sat on two orders.
--
-- $1 = order_id, $2 = the stock lot's id.
WITH minted AS (
  INSERT INTO inventory.lots
         (bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
          content_snapshot, image_id)
  SELECT bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
         content_snapshot, image_id
    FROM inventory.lots
   WHERE id = $2
  RETURNING id
),
edged AS (
  INSERT INTO inventory.lot_sources (lot_id, source_lot_id, kind)
  SELECT minted.id, $2, 'sale' FROM minted
  RETURNING id
)
INSERT INTO orders.lots (order_id, lot_id)
SELECT $1, minted.id FROM minted
RETURNING id, order_id, lot_id,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
          created_by_id, updated_by_id
