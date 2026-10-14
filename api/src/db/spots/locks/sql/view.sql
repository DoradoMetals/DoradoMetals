-- One lock as the Spots page and the metal page draw it. A lock has no expiry
-- (ruling 2026-10-14): it is active until an unlock of the same order and
-- metal follows it, then released. `quantity` is the order's fine content in
-- that metal, in troy ounces.
SELECT l.id,
       l.order_id,
       /*__order_reference__*/ AS reference,
       o.direction,
       l.metal_id,
       COALESCE(q.quantity, 0) AS quantity,
       l.bid,
       l.ask,
       l.created_at,
       l.created_by AS locked_by,
       l.created_by_id AS locked_by_id,
       CASE WHEN u.released_at IS NULL THEN 'active' ELSE 'released' END AS status,
       u.released_at,
       u.released_by
  FROM orders.spot_locks l
  JOIN orders.orders o ON o.id = l.order_id
  LEFT JOIN LATERAL (
         SELECT ul.created_at AS released_at, ul.created_by AS released_by
           FROM orders.spot_locks ul
          WHERE ul.order_id = l.order_id
            AND ul.metal_id = l.metal_id
            AND ul.action = 'unlock'
            AND ul.created_at >= l.created_at
          ORDER BY ul.created_at ASC, ul.id ASC
          LIMIT 1) u ON TRUE
  LEFT JOIN LATERAL (
         SELECT sum(li.content) AS quantity
           FROM orders.lots ol
           JOIN inventory.lots li ON li.id = ol.lot_id
          WHERE ol.order_id = l.order_id
            AND li.metal_id = l.metal_id) q ON TRUE
 WHERE l.action = 'lock'
