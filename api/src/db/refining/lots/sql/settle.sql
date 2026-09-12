-- Settlement writes each named refiner lot's own figures onto inventory.lots
-- - the mint at batch time created that row, and settling is what corrects
-- it (ruling 120/121). A lot the statement does not name keeps the figures
-- it already has, so a partial settlement leaves the rest alone.
--
-- settled_spot is per pricing event, stamped here, not passed down from the
-- order: a `paid` order takes the line's own spot, or the metal's live
-- bid/ask when the line is silent (bid first, matching
-- refining.order_money); a `pooled` order never carries a spot anywhere, so
-- it is forced NULL regardless of what the line or the live market says -
-- the rules layer already refuses a `pooled` line that tries to carry one.
WITH lines AS (
  SELECT * FROM unnest(
    $2::uuid[], $3::numeric[], $4::numeric[], $5::numeric[], $6::text[],
    $7::numeric[], $8::numeric[]
  ) AS t(lot_id, pre_melt, post_melt, purity, unit, premium, settled_spot)
)
UPDATE inventory.lots li
   SET pre_melt = COALESCE(a.pre_melt, li.pre_melt),
       post_melt = COALESCE(a.post_melt, li.post_melt),
       purity = COALESCE(a.purity, li.purity),
       unit = COALESCE(a.unit, li.unit),
       premium = COALESCE(a.premium, li.premium),
       settled_spot = CASE
         WHEN ro.settlement_type = 'pooled' THEN NULL
         ELSE COALESCE(
                a.settled_spot,
                li.settled_spot,
                (SELECT sp.bid FROM spots.spots sp WHERE sp.metal_id = li.metal_id),
                (SELECT sp.ask FROM spots.spots sp WHERE sp.metal_id = li.metal_id))
       END,
       settled_at = COALESCE(li.settled_at, now())
  FROM lines a
  JOIN refining.lots rl ON rl.lot_id = a.lot_id
  JOIN refining.orders ro ON ro.id = rl.refining_order_id
 WHERE li.id = a.lot_id
   AND rl.refining_order_id = $1
RETURNING rl.id, rl.refining_order_id, rl.lot_id,
          to_char(rl.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          to_char(rl.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
          rl.created_by_id, rl.updated_by_id
