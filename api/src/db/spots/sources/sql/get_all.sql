-- Live / Standby / Off is a CASE and never a column (ruling 112): Off is a
-- disabled feed, Live is one some metal reads, Standby is enabled and read by
-- none. The metals a source serves are aggregated here too, in the metal's own
-- sort order, so no list is stored and none is stitched in TypeScript.
SELECT s.id,
       s.enabled,
       s.sort_order,
       s.last_tick_at,
       s.last_attempt_at,
       s.last_error,
       s.created_at,
       s.updated_at,
       s.created_by,
       s.updated_by,
       s.created_by_id,
       s.updated_by_id,
       CASE WHEN NOT s.enabled THEN 'Off'
            WHEN EXISTS (SELECT 1 FROM spots.active_sources a WHERE a.source_id = s.id)
              THEN 'Live'
            ELSE 'Standby' END AS status,
       COALESCE((SELECT array_agg(a.metal_id ORDER BY m.sort_order, a.metal_id)
                   FROM spots.active_sources a
                   JOIN metals.metals m ON m.id = a.metal_id
                  WHERE a.source_id = s.id), ARRAY[]::text[]) AS metal_ids
  FROM spots.sources s
 ORDER BY s.sort_order ASC, s.id ASC
