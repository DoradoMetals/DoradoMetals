SELECT id, refining_order_id, lot_id, unit, pre_melt, post_melt, purity, content, premium,
       to_char(settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS settled_at,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       created_by_id, updated_by_id
  FROM refining.lots
 WHERE id = $1
