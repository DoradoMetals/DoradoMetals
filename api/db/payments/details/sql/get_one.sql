-- One payout account, by id.
--
-- NEVER routing_number OR account_number, and never the sealed envelopes
-- either: the two last-four values are the only bank facts here, and they are
-- what every order payload and the admin panel render. The envelopes have one
-- door - sql/get_sealed.sql.
SELECT id, user_id, method_id, account_holder, bank_name, account_type,
       last_four, routing_last_four, card_brand, email_to,
       provider, provider_ref, created_at, updated_at
  FROM payments.details
 WHERE id = $1
