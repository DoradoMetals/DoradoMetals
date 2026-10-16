-- The refiner orders list, one read: a page of cards and the counts under the
-- filter bar, in the customer orders list's shape. $1 refiner_id,
-- $2 direction, $3 state, $4 assigned_to_id, $5 sort key, $6 limit, $7 offset.
--
-- The counts are measured over EVERY matching order and the items over one
-- page, because a count is a statement about the filter, not about the page.
-- Each item is the single order's view (view_body.sql), so a card and the
-- order screen cannot disagree.
--
-- `sort` is a row of orders.list_sorts (ruling 116), the same rows the
-- customer list sorts by: a row names a field and a way, never SQL. On a
-- refiner order `estimated_value` is the expected settlement, `lot_count` the
-- held lots and `arrived_at` the arrival of its fulfillment.
WITH srt AS (
  SELECT s.sort_field, s.descending
    FROM orders.list_sorts s
   WHERE CASE WHEN $5::text IS NULL
              THEN s.sort_order = (SELECT min(s2.sort_order) FROM orders.list_sorts s2)
              ELSE s.key = $5::text END
   LIMIT 1
),
matched AS (
  SELECT ro.id,
         ro.created_at,
         money.expected_settlement,
         held.lot_count,
         arr.arrived_at
    FROM refining.orders ro
    LEFT JOIN refining.order_money money ON money.refining_order_id = ro.id
   CROSS JOIN LATERAL (
          SELECT count(*)::int AS lot_count
            FROM refining.lots hl
           WHERE hl.refining_order_id = ro.id AND hl.released_at IS NULL
        ) held
    LEFT JOIN LATERAL (
          SELECT max(a.arrived_at) AS arrived_at
            FROM fulfillments.arrivals a
           WHERE a.refining_order_id = ro.id AND a.arrived
        ) arr ON TRUE
   WHERE ($1::uuid IS NULL OR ro.refiner_id = $1::uuid)
     AND ($2::refining.direction IS NULL OR ro.direction = $2::refining.direction)
     AND ($3::text IS NULL OR $3::text = /*__refining_state__*/)
     AND ($4::uuid IS NULL OR ro.assigned_to_id = $4::uuid)
),
ranked AS (
  SELECT m.*,
         (CASE srt.sort_field
            WHEN 'created_at' THEN extract(epoch FROM m.created_at)
            WHEN 'estimated_value' THEN m.expected_settlement
            WHEN 'lot_count' THEN m.lot_count::numeric
            WHEN 'arrived_at' THEN extract(epoch FROM m.arrived_at)
          END)
         * (CASE WHEN srt.descending THEN -1 ELSE 1 END) AS rank
    FROM matched m
    LEFT JOIN srt ON TRUE
),
page AS (
  SELECT r.id, r.rank, r.created_at
    FROM ranked r
   ORDER BY r.rank ASC NULLS LAST, r.created_at DESC, r.id DESC
   LIMIT COALESCE($6::int, 50) OFFSET COALESCE($7::int, 0)
)
SELECT jsonb_build_object(
         'counts', jsonb_build_object(
           'orders', (SELECT count(*)::int FROM matched),
           'lots', (SELECT COALESCE(sum(m.lot_count), 0)::int FROM matched m)),
         'items', COALESCE(
           (SELECT jsonb_agg(card.view ORDER BY p.rank ASC NULLS LAST, p.created_at DESC, p.id DESC)
              FROM page p
             CROSS JOIN LATERAL (
                    /*__refining_view__*/
                     WHERE ro.id = p.id
                  ) card),
           '[]'::jsonb)) AS view
