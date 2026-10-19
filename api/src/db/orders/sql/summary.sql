-- The Orders list's totals line, one read: how many orders of a direction
-- there are, how many sit in each state, and how many of their lots are still
-- on hand and unassigned. $1 direction (NULL for both).
--
-- It takes NO filter but the direction, on purpose: the Admin Header's line
-- under the title is the business at a glance and never moves with the
-- filters; the "N matching" count beside Reset is the list read's
-- counts.orders, which does. The state and the lot position are substituted
-- from the same expressions list.sql uses, so the two reads cannot disagree.
WITH counted AS (
  SELECT (/*__order_state__*/) AS state,
         tally.unassigned_lots
    FROM orders.orders o
   CROSS JOIN LATERAL (
          SELECT (count(*) FILTER (WHERE seat.position = 'on hand'))::int AS unassigned_lots
            FROM orders.lots ul
            JOIN inventory.lots li ON li.id = ul.lot_id
           CROSS JOIN LATERAL (SELECT (/*__lot_position__*/) AS position) seat
           WHERE ul.order_id = o.id
        ) tally
   WHERE ($1::orders.direction IS NULL OR o.direction = $1::orders.direction)
)
SELECT jsonb_build_object(
         'orders', (SELECT count(*)::int FROM counted),
         'unassigned_lots', (SELECT COALESCE(sum(c.unassigned_lots), 0)::int FROM counted c),
         'states', COALESCE(
           (SELECT jsonb_agg(jsonb_build_object('state', s.state, 'count', s.count)
                             ORDER BY s.state)
              FROM (SELECT c.state, count(*)::int AS count
                      FROM counted c
                     GROUP BY c.state) s),
           '[]'::jsonb)) AS view
