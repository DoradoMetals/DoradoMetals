-- One linked account as a screen may see it; see linked_for.sql.
SELECT id, user_id, status, bank_name, account_name, last_four, sent_to,
       sent_via AS channel,
       to_char(sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS sent_at,
       to_char(verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS verified_at,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
  FROM payments.bank_links
 WHERE id = $1
