-- A BANK ACCOUNT IS LINKED THROUGH PLAID HOSTED LINK (ruling 160).
--
-- Staff never take routing or account numbers. An admin sends the customer a
-- Plaid Hosted Link by SMS or email; the row is written Pending when the link
-- is sent, and Plaid's webhooks complete it: SESSION_FINISHED gives the public
-- token, which is exchanged for the provider token, and the bank, account name
-- and mask are read with it; AUTH AUTOMATICALLY_VERIFIED marks a
-- micro-deposit account Verified.
--
-- payments.bank_links was Moov-shaped, so `moov_account_id` becomes nullable
-- for a Plaid row and a check keeps it required for a Moov row. The provider
-- token is SEALED with the same envelope the payout bank columns use
-- (`provider_token_encrypted` plus `encryption_key_id`); no plaintext token
-- column exists. `plaid_link_token` matches the SESSION_FINISHED webhook to the
-- row it completes; `plaid_item_id` and `plaid_account_id` match the AUTH
-- webhook. `sent_via`, `sent_to` and `sent_at` say how and where the link went.
--
-- Additive: nullable columns, one relaxed NOT NULL, one check that every
-- existing row already meets (every existing row is a Moov row with an
-- account). `exchange` is neither read nor written.

ALTER TABLE payments.bank_links ALTER COLUMN moov_account_id DROP NOT NULL;

ALTER TABLE payments.bank_links
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS provider_token_encrypted text,
  ADD COLUMN IF NOT EXISTS encryption_key_id text,
  ADD COLUMN IF NOT EXISTS plaid_link_token text,
  ADD COLUMN IF NOT EXISTS plaid_item_id text,
  ADD COLUMN IF NOT EXISTS plaid_account_id text,
  ADD COLUMN IF NOT EXISTS sent_via text,
  ADD COLUMN IF NOT EXISTS sent_to text,
  ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_links_moov_row_has_an_account') THEN
    ALTER TABLE payments.bank_links ADD CONSTRAINT bank_links_moov_row_has_an_account
      CHECK (provider <> 'moov' OR moov_account_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_links_sent_via_known') THEN
    ALTER TABLE payments.bank_links ADD CONSTRAINT bank_links_sent_via_known
      CHECK (sent_via IS NULL OR sent_via IN ('sms', 'email'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_links_token_is_sealed_with_a_key') THEN
    ALTER TABLE payments.bank_links ADD CONSTRAINT bank_links_token_is_sealed_with_a_key
      CHECK (provider_token_encrypted IS NULL OR encryption_key_id IS NOT NULL);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS bank_links_plaid_link_token_key
  ON payments.bank_links (plaid_link_token) WHERE plaid_link_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS bank_links_plaid_item_idx
  ON payments.bank_links (plaid_item_id, plaid_account_id) WHERE plaid_item_id IS NOT NULL;
