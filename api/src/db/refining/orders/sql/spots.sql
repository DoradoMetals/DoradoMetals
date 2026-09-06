-- A refiner order's four frozen prices, one row per metal on it. A refiner
-- order has no orders.spots row and never gets one: the price its metal changed
-- hands at is the pool's last lock for that refiner and metal at or before the
-- settlement. `locked` says whether that lock exists - when it does not, the
-- live bid stands in and the card can say so.
SELECT owed.metal_id,
       COALESCE(pl.lock_price, sp.bid) AS bid,
       sp.ask,
       pl.lock_price IS NOT NULL AS locked
  FROM (SELECT DISTINCT li.metal_id
          FROM refining.lots rl
          JOIN lots.items li ON li.id = rl.lot_id
         WHERE rl.refining_order_id = $1) owed
  JOIN refining.orders ro ON ro.id = $1
  LEFT JOIN spots.spots sp ON sp.metal_id = owed.metal_id
  LEFT JOIN LATERAL (
         SELECT p.lock_price FROM refining.pool p
          WHERE p.refiner_id = ro.refiner_id
            AND p.metal_id = owed.metal_id
            AND p.entry = 'lock'
            AND p.occurred_at <= COALESCE(ro.settled_at, now())
          ORDER BY p.occurred_at DESC, p.id DESC LIMIT 1) pl ON TRUE
 ORDER BY array_position(ARRAY['Gold','Silver','Platinum','Palladium'], owed.metal_id)
            NULLS LAST,
          owed.metal_id ASC
