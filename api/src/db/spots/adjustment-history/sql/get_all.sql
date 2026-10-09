-- One list, three kinds of event (audit rows 15-17). The label is a CASE over
-- `field`, not a column: an active-source switch names the metal only, a
-- cleared adjustment is the DELETE the trigger logged with no new value.
SELECT h.id,
       h.metal_id,
       h.source_id,
       h.field,
       h.old_value,
       h.new_value,
       h.actor_id,
       h.actor_name,
       h.changed_at,
       CASE WHEN h.field = 'active_source' THEN 'active source set'
            WHEN h.new_value IS NULL THEN 'adjustment cleared'
            WHEN h.old_value IS NULL THEN 'adjustment set'
            ELSE 'adjustment changed' END AS event
  FROM spots.adjustment_history h
 WHERE h.changed_at >= now() - make_interval(days => $1::integer)
   AND ($2::text IS NULL OR h.metal_id = $2::text)
 ORDER BY h.changed_at DESC, h.id ASC
