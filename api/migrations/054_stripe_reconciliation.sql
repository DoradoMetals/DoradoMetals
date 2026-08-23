-- payments.stripe_charges: what Stripe says happened.
--
-- exchange.payment_intents is not a reliable record of payments, and the
-- payments migration cannot be built on the assumption that it is. Checked
-- against production on 2026-08-22: of the eight intents Stripe shows as
-- settled, exchange records one as succeeded. Three say
-- 'requires_payment_method' though the money moved, and four have no row at
-- all. Only 2 of 25 intents link to a sales order and none to a purchase order.
--
-- Nothing broke visibly because the order lifecycle never consults this table -
-- orders completed regardless - which is exactly why it went unnoticed for a
-- year. But it means the application cannot answer "was this order paid for"
-- from its own data, and a payments migration derived from exchange alone would
-- faithfully reproduce the error: a ledger claiming one payment where there
-- were eight.
--
-- So the terminal truth comes from Stripe, and it comes in as its own table
-- rather than as a correction to exchange. Three reasons:
--
--   1. exchange is never written to by this migration. Correcting it in place
--      would be an UPDATE against the one schema that must stay untouched, and
--      lint:migrations would refuse it - rightly.
--   2. The disagreement becomes visible data that can be queried and argued
--      with, instead of a silent fix nobody can audit later.
--   3. It is reversible. DROP TABLE payments.stripe_charges loses nothing that
--      is not in the Stripe dashboard.
--
-- Populated by 055, which is generated from a Stripe export by
-- scripts/dump-stripe-reconciliation.mjs. Regenerate when a fresher export is
-- taken; the seed is keyed on the payment intent id and is idempotent.
--
-- Deliberately holds no personal data. The export carries cardholder names,
-- billing addresses and card last4; none of it is here, because none of it is
-- needed to reconcile a payment and all of it would be a new place for personal
-- data to live. Amounts, statuses, fees and Stripe's own opaque ids only.
--
-- Amounts are in DOLLARS, as Stripe exports them. exchange.payment_intents
-- stores CENTS. Anything comparing the two has to say which it means.

CREATE TABLE IF NOT EXISTS payments.stripe_charges (
  payment_intent_id    text PRIMARY KEY,
  charge_id            text,
  created_at           timestamptz NOT NULL,
  amount               numeric NOT NULL,
  amount_refunded      numeric,
  fee                  numeric,
  currency             text,
  captured             boolean,
  status               text NOT NULL,
  refunded_at          timestamptz,
  payment_source_type  text,
  stripe_customer_id   text,
  livemode             boolean,
  imported_at          timestamptz NOT NULL DEFAULT now()
);

-- The two questions this table exists to answer quickly.
CREATE INDEX IF NOT EXISTS stripe_charges_customer_idx
  ON payments.stripe_charges (stripe_customer_id);
CREATE INDEX IF NOT EXISTS stripe_charges_settled_idx
  ON payments.stripe_charges (status) WHERE charge_id IS NOT NULL;
