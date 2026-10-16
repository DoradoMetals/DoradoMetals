SELECT id, refining_order_id, lot_id,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       created_by_id, updated_by_id,
       to_char(released_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS released_at,
       to_char(returned_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS returned_at
  FROM refining.lots
 WHERE refining_order_id = $1
   AND released_at IS NULL
 ORDER BY created_at ASC, id ASC
