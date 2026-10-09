-- The sorts the Orders list offers, in the order the select draws them. The
-- lowest sort_order is the default (ruling 116: the set is rows).
SELECT s.id, s.key, s.label, s.sort_field, s.descending, s.sort_order,
       to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(s.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       s.created_by_id, s.updated_by_id
  FROM orders.list_sorts s
 ORDER BY s.sort_order ASC
