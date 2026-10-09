-- The Orders list, one read: the page of cards, and the two counts under the
-- filter bar. $1 direction, $2 user_id, $3 state[], $4 assigned_to_id,
-- $5 sort key, $6 unassigned, $7 has_unassigned_lots, $8 limit, $9 offset.
--
-- The counts are measured over EVERY matching order and the items over one
-- page of them, because `6 orders - 18 unassigned lots` is a statement about
-- the filter, not about the page.
--
-- Four expressions are substituted rather than written here, so the chip, the
-- badge, the position and the money cannot disagree with the single order
-- view: the order state and the order reference from db/orders/sql, the lot
-- position from db/inventory/lots/sql, and the estimated value from
-- db/pricing/sql - ruling 75, only pricing prices.
--
-- `sort` is a row of orders.list_sorts (ruling 116). A row names a field and a
-- way, never a fragment of SQL: `rank` is the named field's own number
-- multiplied by the sign of `descending`, so no statement is ever assembled
-- from a row's text, and an unnamed sort takes the lowest `sort_order`.
WITH srt AS (
  SELECT s.sort_field, s.descending
    FROM orders.list_sorts s
   WHERE CASE WHEN $5::text IS NULL
              THEN s.sort_order = (SELECT min(s2.sort_order) FROM orders.list_sorts s2)
              ELSE s.key = $5::text END
   LIMIT 1
),
matched AS (
  SELECT o.id,
         o.created_at,
         (/*__order_state__*/) AS state,
         /*__order_estimated_value__*/ AS estimated_value,
         tally.lot_count,
         tally.unassigned_lots,
         arr.arrived_at
    FROM orders.orders o
   CROSS JOIN LATERAL (
          SELECT count(*)::int AS lot_count,
                 (count(*) FILTER (WHERE seat.position = 'on hand'))::int AS unassigned_lots
            FROM orders.lots ul
            JOIN inventory.lots li ON li.id = ul.lot_id
           CROSS JOIN LATERAL (SELECT (/*__lot_position__*/) AS position) seat
           WHERE ul.order_id = o.id
        ) tally
    LEFT JOIN LATERAL (
          SELECT max(a.arrived_at) AS arrived_at
            FROM fulfillments.arrivals a
           WHERE a.order_id = o.id AND a.arrived
        ) arr ON TRUE
   WHERE ($1::orders.direction IS NULL OR o.direction = $1::orders.direction)
     AND ($2::uuid IS NULL OR o.user_id = $2::uuid)
     AND ($3::text[] IS NULL OR (/*__order_state__*/) = ANY($3::text[]))
     AND ($4::uuid IS NULL OR o.assigned_to_id = $4::uuid)
     AND ($6::boolean IS NOT TRUE OR o.assigned_to_id IS NULL)
     AND ($7::boolean IS NOT TRUE OR tally.unassigned_lots > 0)
),
ranked AS (
  SELECT m.*,
         (CASE srt.sort_field
            WHEN 'created_at' THEN extract(epoch FROM m.created_at)
            WHEN 'estimated_value' THEN m.estimated_value
            WHEN 'lot_count' THEN m.lot_count::numeric
            WHEN 'arrived_at' THEN extract(epoch FROM m.arrived_at)
          END)
         * (CASE WHEN srt.descending THEN -1 ELSE 1 END) AS rank
    FROM matched m
   CROSS JOIN srt
),
page AS (
  SELECT r.id, r.rank, r.created_at, r.state, r.estimated_value, r.lot_count, r.arrived_at
    FROM ranked r
   ORDER BY r.rank ASC NULLS LAST, r.created_at DESC, r.id DESC
   LIMIT COALESCE($8::int, 50) OFFSET COALESCE($9::int, 0)
)
SELECT jsonb_build_object(
         'counts', jsonb_build_object(
           'orders', (SELECT count(*)::int FROM matched),
           'unassigned_lots',
             (SELECT COALESCE(sum(m.unassigned_lots), 0)::int FROM matched m)),
         'items', COALESCE(
           (SELECT jsonb_agg(card.item
                     ORDER BY card.rank ASC NULLS LAST, card.created_at DESC, card.id DESC)
              FROM (
                SELECT p.id, p.rank, p.created_at,
                       to_jsonb(o)
                       || jsonb_build_object(
                            'created_at', to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                            'updated_at', to_char(o.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                            'cancelled_at', to_char(o.cancelled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                            'placed_at', to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                            'arrived_at', to_char(p.arrived_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                            'totals',
                              (SELECT to_jsonb(t)
                                      || jsonb_build_object(
                                           'created_at', to_char(t.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                           'updated_at', to_char(t.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                                 FROM orders.transactions t
                                WHERE t.order_id = o.id),
                            'reference', /*__order_reference__*/,
                            'state', p.state,
                            'estimated_value', p.estimated_value,
                            'lot_count', p.lot_count,
                            'more_count', GREATEST(p.lot_count - 3, 0),
                            'lots', COALESCE(
                              (SELECT jsonb_agg(
                                        jsonb_build_object(
                                          'lot_id', top.lot_id,
                                          'reference', 'Lot ' || o.number || '-' || chr(64 + top.seat::int),
                                          'product_name', top.product_name,
                                          'form', top.form,
                                          'weight', COALESCE(top.post_melt, top.pre_melt),
                                          'unit', top.unit,
                                          'purity', top.purity,
                                          'destination', top.destination)
                                        ORDER BY top.seat ASC)
                                 FROM (
                                   SELECT ol.lot_id,
                                          row_number() OVER (ORDER BY ol.created_at ASC, ol.id ASC) AS seat,
                                          b.name AS product_name,
                                          COALESCE(b.type, 'Scrap') AS form,
                                          li2.post_melt, li2.pre_melt, li2.unit, li2.purity,
                                          dest.reference AS destination
                                     FROM orders.lots ol
                                     JOIN inventory.lots li2 ON li2.id = ol.lot_id
                                     LEFT JOIN products.bullion b ON b.id = li2.bullion_id
                                     LEFT JOIN LATERAL (
                                            SELECT d.reference
                                              FROM (
                                                SELECT (CASE ro.direction WHEN 'buy' THEN 'RP-' ELSE 'RS-' END)
                                                       || ro.number AS reference
                                                  FROM inventory.lot_sources ls
                                                  JOIN refining.lots rl ON rl.lot_id = ls.lot_id
                                                  JOIN refining.orders ro ON ro.id = rl.refining_order_id
                                                 WHERE ls.source_lot_id = ol.lot_id AND ls.kind = 'batch'
                                                 UNION ALL
                                                SELECT (CASE WHEN so.direction = 'sale' THEN 'SO-' ELSE 'PO-' END)
                                                       || so.number
                                                  FROM inventory.lot_sources se
                                                  JOIN orders.lots sol ON sol.lot_id = se.lot_id
                                                  JOIN orders.orders so ON so.id = sol.order_id
                                                 WHERE se.source_lot_id = ol.lot_id AND se.kind = 'sale'
                                              ) d
                                             LIMIT 1
                                          ) dest ON TRUE
                                    WHERE ol.order_id = o.id
                                    ORDER BY ol.created_at ASC, ol.id ASC
                                    LIMIT 3
                                 ) top),
                              '[]'::jsonb),
                            'customer',
                              (SELECT jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email)
                                 FROM auth.users u
                                WHERE u.id = o.user_id)) AS item
                  FROM page p
                  JOIN orders.orders o ON o.id = p.id
              ) card),
           '[]'::jsonb)) AS view
