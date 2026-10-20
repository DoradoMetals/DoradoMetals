-- A customer's linked accounts as a screen may see them (ruling 160): the bank,
-- the account name, the last four and how the link went. Never a number, never
-- the provider token, never a Moov or Plaid id.
SELECT id, user_id, status, bank_name, account_name, last_four, sent_to,
       sent_via AS channel,
       to_char(sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS sent_at,
       to_char(verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS verified_at,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
  FROM payments.bank_links
 WHERE user_id = $1
 ORDER BY created_at DESC, id
