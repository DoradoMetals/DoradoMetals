-- The Stripe payment method id has no home, and it is what a live write keys on.
--
-- Second instance of the mistake 075 corrected, found the same way: writing the
-- payments repo split and discovering the new schema cannot express a query the
-- old one runs.
--
--   UPDATE exchange.payment_intents
--   SET method_type = $1, routing = $2, last_four = $3, card_brand = $4,
--       bank_name = $5, bank_account_type = $6
--   WHERE method_id = $7
--
-- `method_id` there is TEXT holding a Stripe PaymentMethod id - pm_... - which
-- is not the same thing as payments.intents.method_id, a uuid foreign key to
-- payments.methods saying which KIND of payment it is. Two different concepts
-- wearing one name, and 074 mapped the kind and lost the reference.
--
-- The payer's card or bank belongs in payments.details, which is the table for a
-- payment instrument whoever owns it - a customer's card on the way in, our
-- payee's bank on the way out. It needs a way to be found by the provider's id
-- for it, which is what updateMethod has in hand when Stripe tells us what was
-- used.
--
-- provider is named rather than assumed: payments.attempts already carries
-- provider and provider_ref for the same reason, and a second processor would
-- issue its own ids.
--
-- Populated lightly in production - 3 intents carry a method_id, 1 a last_four
-- and 1 a card_brand - because most intents never got as far as a payment. That
-- is exactly why it must be carried rather than dropped: the ones that did are
-- the ones that took money.
--
-- Worth recording alongside it: exchange.payment_intents.routing is populated on
-- ZERO production rows. The column exists and updateMethod writes it, but no
-- customer bank routing number has ever been stored there. The plaintext bank
-- details in this business are confined to exchange.payouts, which is what
-- FOLLOWUPS has said, and this checks rather than assumes it.
--
-- Additive and nullable. exchange is untouched.

ALTER TABLE payments.details
  ADD COLUMN IF NOT EXISTS provider     text,
  ADD COLUMN IF NOT EXISTS provider_ref text;

-- updateMethod finds a detail row by the provider's id for it.
CREATE UNIQUE INDEX IF NOT EXISTS details_provider_ref_key
  ON payments.details (provider, provider_ref)
  WHERE provider_ref IS NOT NULL;
