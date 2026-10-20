-- The accounts a payout is sent from (ruling 116: rows, not a list in code),
-- the default first. No bank numbers live here.
SELECT id, label, mask, is_default, sort_order,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       created_by_id, updated_by_id
  FROM payments.funding_sources
 ORDER BY is_default DESC, sort_order ASC, label ASC, id ASC
