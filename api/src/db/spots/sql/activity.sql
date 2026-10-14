-- The metal page Activity: the metal's lock events, its adjustment and
-- active-source changes, and the events of the feeds it reads (its own
-- source, its override and the default), merged and newest first over the
-- last $2 days. Every row has the same columns; the ones a kind does not
-- carry are NULL. `event` is the label, derived here and never stored.
WITH metal AS (
  SELECT r.metal_id, r.source_id FROM spots.resolved r WHERE r.metal_id = $1
),
feeds AS (
  SELECT m.source_id AS id FROM metal m WHERE m.source_id IS NOT NULL
  UNION
  SELECT a.source_id FROM spots.active_sources a WHERE a.metal_id = $1
  UNION
  SELECT s.id FROM spots.sources s WHERE s.is_default
),
since AS (
  SELECT now() - make_interval(days => $2::integer) AS at
)
SELECT ev.*
  FROM (
    SELECT l.id,
           l.action AS kind,
           CASE WHEN l.action = 'lock' THEN 'locked' ELSE 'unlocked' END AS event,
           l.created_at AS at,
           l.created_by_id AS actor_id,
           nullif(l.created_by, '') AS actor_name,
           l.order_id,
           /*__order_reference__*/ AS reference,
           NULL::text AS source_id,
           NULL::text AS field,
           NULL::text AS old_value,
           NULL::text AS new_value,
           l.bid,
           l.ask,
           NULL::text AS detail
      FROM orders.spot_locks l
      JOIN orders.orders o ON o.id = l.order_id
     WHERE l.metal_id = $1
       AND l.created_at >= (SELECT at FROM since)
    UNION ALL
    SELECT h.id,
           'adjustment',
           CASE WHEN h.field = 'active_source' THEN 'active source set'
                WHEN h.field = 'mode' AND h.new_value = 'freeze' THEN 'freeze set'
                WHEN h.new_value IS NULL THEN 'adjustment cleared'
                WHEN h.old_value IS NULL THEN 'adjustment set'
                ELSE 'adjustment changed' END,
           h.changed_at,
           h.actor_id,
           h.actor_name,
           NULL::uuid,
           NULL::text,
           h.source_id,
           h.field,
           h.old_value,
           h.new_value,
           NULL::numeric,
           NULL::numeric,
           NULL::text
      FROM spots.adjustment_history h
     WHERE h.metal_id = $1
       AND h.changed_at >= (SELECT at FROM since)
    UNION ALL
    SELECT e.id,
           'source',
           CASE e.kind WHEN 'tick_ok' THEN 'feed started'
                       WHEN 'tick_failed' THEN 'feed failed'
                       WHEN 'recovered' THEN 'feed recovered'
                       WHEN 'enabled' THEN 'source turned on'
                       WHEN 'disabled' THEN 'source turned off'
                       ELSE 'made the default source' END,
           e.created_at,
           e.actor_id,
           e.actor_name,
           NULL::uuid,
           NULL::text,
           e.source_id,
           NULL::text,
           NULL::text,
           NULL::text,
           NULL::numeric,
           NULL::numeric,
           e.detail
      FROM spots.source_events e
     WHERE e.source_id IN (SELECT id FROM feeds)
       AND e.created_at >= (SELECT at FROM since)
  ) ev
 ORDER BY ev.at DESC, ev.id ASC
