-- One source as every read returns it. Live / Standby / Off is a CASE and
-- never a column (ruling 112): Off is a disabled feed, Live is one some metal
-- reads, Standby is enabled and read by none. "Reads" is spots.resolved's
-- answer - the metal's override, else the default, else the next enabled
-- source in sort_order - so a metal following the default counts for it.
SELECT s.id,
       s.enabled,
       s.is_default,
       s.sort_order,
       s.last_tick_at,
       s.last_attempt_at,
       s.last_error,
       s.failed_polls,
       s.created_at,
       s.updated_at,
       s.created_by,
       s.updated_by,
       s.created_by_id,
       s.updated_by_id,
       CASE WHEN NOT s.enabled THEN 'Off'
            WHEN EXISTS (SELECT 1 FROM spots.resolved r WHERE r.source_id = s.id) THEN 'Live'
            ELSE 'Standby' END AS status,
       COALESCE((SELECT array_agg(r.metal_id ORDER BY m.sort_order, r.metal_id)
                   FROM spots.resolved r
                   JOIN metals.metals m ON m.id = r.metal_id
                  WHERE r.source_id = s.id), ARRAY[]::text[]) AS metal_ids
  FROM spots.sources s
