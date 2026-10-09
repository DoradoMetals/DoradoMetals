-- The documents a refiner order carries, in the order the card draws them.
-- Ruling 116: the set is rows, seeded by migration 264. `renderable` says
-- whether the API can produce the file itself; everything else becomes
-- available only once a file is imported.
SELECT d.id, d.kind, d.name, d.renderable, d.sort_order,
       to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(d.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       d.created_by_id, d.updated_by_id
  FROM refining.documents d
 ORDER BY d.sort_order ASC
