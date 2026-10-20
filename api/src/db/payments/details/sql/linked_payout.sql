-- The payout details of an account the business already knows (ruling 160):
-- a linked bank account's holder, bank and last four, the email on file for an
-- eCheck, or nothing for the Dorado balance. No number exists to seal, so the
-- sealed columns are written NULL. No row when the method is not a purchase
-- payout method.
SELECT m.id AS method_id,
       COALESCE(b.account_name, b.holder_name, u.name) AS account_holder,
       b.bank_name,
       NULL::text AS account_type,
       b.last_four,
       NULL::text AS routing_last_four,
       CASE WHEN m.type = 'ECHECK' THEN u.email END AS email_to,
       NULL::text AS routing_number_encrypted,
       NULL::text AS account_number_encrypted,
       NULL::text AS encryption_key_id
  FROM auth.users u
  JOIN payments.methods m ON m.direction = 'purchase' AND m.type = $2
  LEFT JOIN payments.bank_links b ON b.id = $3::uuid AND b.user_id = u.id
 WHERE u.id = $1
