-- A payer's card or bank becomes a payments.details row.
--
-- exchange keeps the payer's instrument inline on the intent - method_id,
-- last_four, card_brand, bank_name, bank_account_type - and the new schema has a
-- table for a payment instrument. One row per intent that got far enough for
-- Stripe to tell us what was used, linked from the intent by details_id.
--
-- The id is derived from the intent's, so the derivation is idempotent and a
-- detail row is traceable back to the intent that produced it. It cannot collide
-- with the payout-derived rows: those keep exchange.payouts' ids.
--
-- routing is NOT carried, and there is nothing to carry - it is null on every
-- production row. If it ever were populated it would be a customer's bank
-- routing number and would want the same encryption treatment as
-- exchange.payouts, not a plain copy.

DO $$
DECLARE
  offender text;
BEGIN
  SELECT string_agg(t, ', ') INTO offender FROM (
    SELECT 'payments.details' t WHERE EXISTS (
      SELECT 1 FROM payments.details d
      WHERE NOT EXISTS (SELECT 1 FROM exchange.payouts p WHERE p.id = d.id)
        AND NOT EXISTS (SELECT 1 FROM exchange.payment_intents e WHERE e.id = d.id))
  ) x;

  IF offender IS NOT NULL THEN
    RAISE EXCEPTION
      'refusing to backfill payer details: % holds rows exchange does not.',
      offender;
  END IF;
END $$;

INSERT INTO payments.details (
  id, user_id, method_id, bank_name, account_type,
  last_four, card_brand, provider, provider_ref, created_at, updated_at
)
SELECT
  e.id,
  e.user_id,
  m.id,
  e.bank_name,
  e.bank_account_type,
  e.last_four,
  e.card_brand,
  'stripe',
  e.method_id,
  e.created_at,
  e.updated_at
FROM exchange.payment_intents e
LEFT JOIN payments.methods m
  ON m.direction = 'sale'
 AND m.type = CASE e.method_type
                WHEN 'us_bank_account' THEN 'ACH'
                WHEN 'card' THEN 'CARD'
                ELSE upper(e.method_type)
              END
WHERE e.method_id IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
  user_id      = EXCLUDED.user_id,
  method_id    = EXCLUDED.method_id,
  bank_name    = EXCLUDED.bank_name,
  account_type = EXCLUDED.account_type,
  last_four    = EXCLUDED.last_four,
  card_brand   = EXCLUDED.card_brand,
  provider     = EXCLUDED.provider,
  provider_ref = EXCLUDED.provider_ref,
  updated_at   = EXCLUDED.updated_at;

-- And the intent points at it.
UPDATE payments.intents i
SET details_id = d.id
FROM payments.details d
WHERE d.id = i.id
  AND i.details_id IS DISTINCT FROM d.id;
