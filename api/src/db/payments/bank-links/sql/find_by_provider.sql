-- The link a Plaid webhook names: SESSION_FINISHED by its link token, AUTH by
-- its item and account. A webhook naming no link of ours finds nothing.
SELECT * FROM payments.bank_links
 WHERE num_nonnulls($1::text, $2::text, $3::text) > 0
   AND ($1::text IS NULL OR plaid_link_token = $1)
   AND ($2::text IS NULL OR plaid_item_id = $2)
   AND ($3::text IS NULL OR plaid_account_id = $3)
 ORDER BY created_at DESC, id
 LIMIT 1
