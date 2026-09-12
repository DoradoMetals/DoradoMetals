-- Settlement writes what the refiner now owes us: content x premium per lot,
-- times the pieces, grouped by metal. One row per metal, citing the order
-- that caused it. Only a `sell` order credits - a `buy` order brings metal
-- in, not a claim on it - and only a `pooled` one: a `paid` order is priced
-- by its settled spots and paid directly, so it never enters the pool.
-- content and premium are the REFINER lot's own (ruling 120), read off
-- inventory.lots through the link, not off refining.lots, which no longer
-- carries them.
INSERT INTO inventory.pool (refiner_id, metal_id, entry, troy_oz, refining_order_id)
SELECT ro.refiner_id, li.metal_id, 'credit',
       sum(li.content * li.premium * li.quantity),
       ro.id
  FROM refining.orders ro
  JOIN refining.lots rl ON rl.refining_order_id = ro.id
  JOIN inventory.lots li ON li.id = rl.lot_id
 WHERE ro.id = $1
   AND ro.direction = 'sell'
   AND ro.settlement_type = 'pooled'
   AND li.content IS NOT NULL
   AND li.premium IS NOT NULL
 GROUP BY ro.refiner_id, li.metal_id, ro.id
HAVING sum(li.content * li.premium * li.quantity) > 0
RETURNING id, refiner_id, metal_id, entry, troy_oz, lock_price, refining_order_id,
          to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          created_by_id, purpose, lot_id
