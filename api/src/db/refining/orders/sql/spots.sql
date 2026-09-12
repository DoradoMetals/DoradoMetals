-- One row per metal on the order: how many refiner lots, how many of them
-- are settled, and the spot those settled lots priced at. Spots are per
-- pricing event, not per refiner order (ruling 121): `spot` reads the most
-- recently settled lot's own settled_spot for that metal, regardless of
-- settlement type (ruling 123), and is NULL until something has settled.
SELECT li.metal_id,
       (SELECT s.settled_spot
          FROM refining.lots srl
          JOIN inventory.lots s ON s.id = srl.lot_id
         WHERE srl.refining_order_id = ro.id
           AND s.metal_id = li.metal_id
           AND s.settled_spot IS NOT NULL
         ORDER BY s.settled_at DESC NULLS LAST, s.id DESC
         LIMIT 1) AS spot,
       count(*) AS lots,
       count(*) FILTER (WHERE li.settled_at IS NOT NULL) AS settled_lots
  FROM refining.orders ro
  JOIN refining.lots rl ON rl.refining_order_id = ro.id
  JOIN inventory.lots li ON li.id = rl.lot_id
 WHERE ro.id = $1
 GROUP BY ro.id, ro.settlement_type, li.metal_id
 ORDER BY array_position(ARRAY['Gold','Silver','Platinum','Palladium'], li.metal_id) NULLS LAST,
          li.metal_id ASC
