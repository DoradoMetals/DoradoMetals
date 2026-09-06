-- Every refiner order, filtered by counterparty, direction and state.
SELECT
       to_jsonb(ro)
       || jsonb_build_object(
            'sent_at', to_char(ro.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'settled_at', to_char(ro.settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'disputed_at', to_char(ro.disputed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'expected_settlement_on', to_char(ro.expected_settlement_on, 'YYYY-MM-DD'),
            'created_at', to_char(ro.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'updated_at', to_char(ro.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'state', CASE WHEN ro.disputed_at IS NOT NULL THEN 'Disputed'
                          WHEN ro.settled_at IS NOT NULL THEN 'Settled'
                          ELSE 'Pending assay' END,
            'refiner',
              (SELECT jsonb_build_object(
                        'id', r.id, 'logo', r.logo,
                        'created_at', to_char(og.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                        'updated_at', to_char(og.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                        'organization', jsonb_build_object(
                          'id', og.id, 'name', og.name, 'email', og.email,
                          'phone', og.phone, 'enabled', og.enabled))
                 FROM refiners.refiners r
                 JOIN organizations.organizations og ON og.id = r.organization_id
                WHERE r.id = ro.refiner_id),
            'lots', COALESCE((
              SELECT jsonb_agg(
                       to_jsonb(rl)
                       || jsonb_build_object(
                            'settled_at', to_char(rl.settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                            'created_at', to_char(rl.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                            'updated_at', to_char(rl.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                            'lot', to_jsonb(li)
                                   || jsonb_build_object(
                                        'created_at', to_char(li.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                        'updated_at', to_char(li.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                        'product_name', b.name,
                                        'form', COALESCE(b.type, 'Scrap'),
                                        'reference', CASE WHEN od.number IS NULL THEN NULL
                                                          ELSE 'Lot ' || od.number || '-' || chr(64 + seat.n::int) END),
                            'order_id', od.id,
                            'order_number', od.number,
                            'order_direction', od.direction,
                            'customer_premium', ol.premium)
                       ORDER BY li.metal_id ASC, rl.id ASC)
                FROM refining.lots rl
                JOIN lots.items li ON li.id = rl.lot_id
                LEFT JOIN products.bullion b ON b.id = li.bullion_id
                LEFT JOIN orders.lots ol ON ol.lot_id = rl.lot_id
                LEFT JOIN orders.orders od ON od.id = ol.order_id
                LEFT JOIN LATERAL (
                       SELECT count(*) AS n FROM orders.lots peer
                        WHERE peer.order_id = ol.order_id
                          AND (peer.created_at, peer.id) <= (ol.created_at, ol.id)
                     ) seat ON TRUE
               WHERE rl.refining_order_id = ro.id), '[]'::jsonb),
            'pool', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                       'refiner_id', bal.refiner_id, 'metal_id', bal.metal_id,
                       'troy_oz', bal.troy_oz,
                       'last_lock_price',
                         (SELECT lk.lock_price FROM refining.pool lk
                           WHERE lk.refiner_id = bal.refiner_id
                             AND lk.metal_id = bal.metal_id
                             AND lk.entry = 'lock'
                           ORDER BY lk.occurred_at DESC, lk.id DESC LIMIT 1))
                       ORDER BY bal.metal_id)
                FROM (SELECT p.refiner_id, p.metal_id, sum(p.troy_oz) AS troy_oz
                        FROM refining.pool p
                       WHERE p.refiner_id = ro.refiner_id
                       GROUP BY p.refiner_id, p.metal_id) bal), '[]'::jsonb),
            'estimated_content', sums.estimated,
            'settled_content', sums.settled,
            'variance', CASE WHEN sums.settled IS NULL OR sums.estimated IS NULL THEN NULL
                             ELSE sums.settled - sums.estimated END,
            'pool_oz', (SELECT sum(p.troy_oz) FROM refining.pool p
                         WHERE p.refining_order_id = ro.id)) AS view
  FROM refining.orders ro
  LEFT JOIN LATERAL (
         SELECT sum(li.content * li.quantity) AS estimated,
                sum(rl.content * li.quantity) AS settled
           FROM refining.lots rl
           JOIN lots.items li ON li.id = rl.lot_id
          WHERE rl.refining_order_id = ro.id
       ) sums ON TRUE
 WHERE ($1::uuid IS NULL OR ro.refiner_id = $1::uuid)
   AND ($2::refining.direction IS NULL OR ro.direction = $2::refining.direction)
   AND ($3::text IS NULL OR $3::text = CASE WHEN ro.disputed_at IS NOT NULL THEN 'Disputed'
                                              WHEN ro.settled_at IS NOT NULL THEN 'Settled'
                                              ELSE 'Pending assay' END)
 ORDER BY ro.number DESC
