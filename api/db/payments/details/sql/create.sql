-- A payout account: WHERE A CUSTOMER'S MONEY GOES. The account only - the
-- order link is orders.transactions.payout_details_id and the per-order fee is
-- orders.transactions.payout_fee, because those have different lifetimes.
--
-- ROUTING AND ACCOUNT NUMBERS ARRIVE AS ENVELOPES, sealed by the service with
-- this row's own id in the AAD, so a copied envelope fails authentication
-- anywhere but its own cell. The legacy plaintext columns beside them are
-- never written and stay NULL forever. The two LAST-FOUR values are not
-- secrets and are stored: they are what the payout panel renders.
--
-- No audit columns: public.audit_stamp writes them (migration 116).
INSERT INTO payments.details
       (id, user_id, method_id, account_holder, bank_name, account_type,
        last_four, routing_last_four, email_to,
        routing_number_encrypted, account_number_encrypted, encryption_key_id,
        card_brand, provider, provider_ref)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
RETURNING id, user_id, method_id, account_holder, bank_name, account_type,
       last_four, routing_last_four, card_brand, email_to,
       provider, provider_ref, created_at, updated_at
