-- One refiner order in one read: the counterparty, its lots with their own
-- figures and which customer lots they were batched from, the pool balance
-- for that refiner, the three settlement figures and the customer sales
-- orders this metal is ultimately bound for. `state` is a label and drives
-- nothing.
--
-- A refiner lot's `lot_id` points at the MINTED lot (ruling 120): its own
-- weights, purity, content and premium live on `inventory.lots`, reached
-- through `rl.lot_id`. `sources` walks back over the `batch` edge to the
-- customer lot(s) it was minted from - one, today, since batching always
-- mints one refiner lot per named customer lot; `share` and multiple
-- sources are there for whenever a lot combines more than one. The first
-- source by (created_at, id) stands in for "the" customer order and premium,
-- the same tie-break `refining.order_money` (190) already uses for premium.
SELECT
       to_jsonb(ro)
       || jsonb_build_object(
            'sent_at', to_char(ro.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'settled_at', to_char(ro.settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'disputed_at', to_char(ro.disputed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'expected_settlement_on', to_char(ro.expected_settlement_on, 'YYYY-MM-DD'),
            'created_at', to_char(ro.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'updated_at', to_char(ro.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'cancelled_at', to_char(ro.cancelled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'state', /*__refining_state__*/,
            'orders_to_date',
              (SELECT count(*) FROM refining.orders peer
                WHERE peer.refiner_id = ro.refiner_id),
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
              SELECT jsonb_agg(lot_row ORDER BY (lot_row -> 'lot' ->> 'metal_id'),
                                        (lot_row ->> 'id'))
                FROM (
                  SELECT jsonb_build_object(
                           'id', rl.id, 'refining_order_id', rl.refining_order_id,
                           'lot_id', rl.lot_id,
                           'created_at', to_char(rl.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                           'updated_at', to_char(rl.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                           'created_by_id', rl.created_by_id, 'updated_by_id', rl.updated_by_id,
                           'lot', to_jsonb(li)
                                  || jsonb_build_object(
                                       'created_at', to_char(li.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                       'updated_at', to_char(li.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                       'assayed_at', to_char(li.assayed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                       'confirmed_at', to_char(li.confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                       'settled_at', to_char(li.settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                       'source', li.source::text,
                                       'product_name', b.name, 'form', COALESCE(b.type, 'Scrap'),
                                       'reference', 'RO-' || ro.number || '-' || chr(64 + rseat.n::int)),
                           'sources', COALESCE(batch.edges, '[]'::jsonb),
                           'order_id', (batch.edges -> 0 ->> 'order_id')::uuid,
                           'order_number', (batch.edges -> 0 ->> 'order_number')::int,
                           'order_direction', batch.edges -> 0 ->> 'order_direction',
                           'order_reference', batch.edges -> 0 ->> 'order_reference',
                           'customer_premium', (batch.edges -> 0 ->> 'premium')::numeric
                         ) AS lot_row
                    FROM refining.lots rl
                    JOIN inventory.lots li ON li.id = rl.lot_id
                    LEFT JOIN products.bullion b ON b.id = li.bullion_id
                    LEFT JOIN LATERAL (
                           SELECT count(*) AS n FROM refining.lots rpeer
                            WHERE rpeer.refining_order_id = rl.refining_order_id
                              AND (rpeer.created_at, rpeer.id) <= (rl.created_at, rl.id)
                         ) rseat ON TRUE
                    LEFT JOIN LATERAL (
                           SELECT jsonb_agg(
                                    jsonb_build_object(
                                      'id', sl.id, 'reference', sref.reference,
                                      'kind', src.kind::text, 'content', sl.content,
                                      'share', CASE WHEN src.n > 1 AND src.total_content IS NOT NULL
                                                          AND src.total_content <> 0
                                                     THEN sl.content / src.total_content
                                                     ELSE NULL END,
                                      'order_id', sod.id, 'order_number', sod.number,
                                      'order_direction', sod.direction::text,
                                      'order_reference',
                                        CASE WHEN sod.number IS NULL THEN NULL
                                             ELSE (CASE WHEN sod.direction = 'sale' THEN 'SO-'
                                                        ELSE 'PO-' END) || sod.number END,
                                      'premium', sl.premium)
                                    ORDER BY src.created_at, src.id) AS edges
                             FROM (
                               SELECT e.id, e.lot_id, e.source_lot_id, e.kind, e.created_at,
                                      count(*) OVER () AS n,
                                      sum(sl0.content) OVER () AS total_content
                                 FROM inventory.lot_sources e
                                 JOIN inventory.lots sl0 ON sl0.id = e.source_lot_id
                                WHERE e.lot_id = li.id AND e.kind = 'batch'
                             ) src
                             JOIN inventory.lots sl ON sl.id = src.source_lot_id
                             LEFT JOIN orders.lots sol ON sol.lot_id = sl.id
                             LEFT JOIN orders.orders sod ON sod.id = sol.order_id
                             LEFT JOIN LATERAL (
                                    SELECT count(*) AS n FROM orders.lots speer
                                     WHERE speer.order_id = sol.order_id
                                       AND (speer.created_at, speer.id) <= (sol.created_at, sol.id)
                                  ) sseat ON TRUE
                             LEFT JOIN LATERAL (
                                    SELECT CASE WHEN sod.number IS NULL THEN NULL
                                                ELSE 'Lot ' || sod.number || '-'
                                                     || chr(64 + sseat.n::int) END AS reference
                                  ) sref ON TRUE
                         ) batch ON TRUE
                   WHERE rl.refining_order_id = ro.id
                ) lots_agg), '[]'::jsonb),
            'pool', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                       'refiner_id', bal.refiner_id, 'metal_id', bal.metal_id,
                       'troy_oz', bal.troy_oz, 'balance', bal.troy_oz,
                       'locked', bal.locked, 'available', bal.troy_oz - bal.locked,
                       'last_lock_price',
                         (SELECT lk.lock_price FROM inventory.pool lk
                           WHERE lk.refiner_id = bal.refiner_id
                             AND lk.metal_id = bal.metal_id
                             AND lk.entry = 'lock'
                           ORDER BY lk.occurred_at DESC, lk.id DESC LIMIT 1))
                       ORDER BY bal.metal_id)
                FROM (SELECT p.refiner_id, p.metal_id, sum(p.troy_oz) AS troy_oz,
                             COALESCE(sum(abs(p.troy_oz)) FILTER (WHERE p.entry = 'lock'), 0) AS locked
                        FROM inventory.pool p
                       WHERE p.refiner_id = ro.refiner_id
                       GROUP BY p.refiner_id, p.metal_id) bal), '[]'::jsonb),
            'estimated_content', sums.estimated,
            'settled_content', sums.settled,
            'variance', CASE WHEN sums.settled IS NULL OR sums.estimated IS NULL THEN NULL
                             ELSE sums.settled - sums.estimated END,
            'pool_oz', (SELECT sum(p.troy_oz) FROM inventory.pool p
                         WHERE p.refining_order_id = ro.id),
            'expected_settlement', money.expected_settlement,
            'totals', jsonb_build_object(
              'fee', money.fee,
              'pool_remediation', money.pool_remediation,
              'payment_charge', money.payment_charge,
              'total', money.total),
            'linked_orders', COALESCE((
              SELECT jsonb_agg(DISTINCT jsonb_build_object(
                       'id', so.id, 'number', so.number, 'direction', so.direction::text,
                       'reference', (CASE WHEN so.direction = 'sale' THEN 'SO-' ELSE 'PO-' END)
                                    || so.number))
                FROM refining.lots rl3
                JOIN inventory.lot_sources sale_edge ON sale_edge.source_lot_id = rl3.lot_id
                                                     AND sale_edge.kind = 'sale'
                JOIN orders.lots sol3 ON sol3.lot_id = sale_edge.lot_id
                JOIN orders.orders so ON so.id = sol3.order_id
               WHERE rl3.refining_order_id = ro.id), '[]'::jsonb)) AS view
  FROM refining.orders ro
  LEFT JOIN LATERAL (
         SELECT
           (SELECT sum(sl.content * sl.quantity)
              FROM refining.lots rl2
              JOIN inventory.lot_sources e ON e.lot_id = rl2.lot_id AND e.kind = 'batch'
              JOIN inventory.lots sl ON sl.id = e.source_lot_id
             WHERE rl2.refining_order_id = ro.id) AS estimated,
           (SELECT sum(li2.content * li2.quantity)
              FROM refining.lots rl2
              JOIN inventory.lots li2 ON li2.id = rl2.lot_id
             WHERE rl2.refining_order_id = ro.id) AS settled
       ) sums ON TRUE
  LEFT JOIN refining.order_money money ON money.refining_order_id = ro.id
 WHERE ro.id = $1
