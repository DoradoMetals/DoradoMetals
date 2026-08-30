-- THE THREE UNIQUE INDEXES WITH NO COUNTERPART AT ALL. D63.
--
-- `audit:constraints` reports seven source uniques without an exact match. Four
-- are ACCEPTED by name in the audit, and each of those four is a merge where
-- the wider index is the CORRECT translation rather than a loss - two carts
-- becoming one checkout keyed on (user_id, direction), two independently
-- numbered order tables becoming one keyed on (direction, number), and a rates
-- band index that is strictly STRONGER than exchange's because it collapses a
-- NULL max_qty instead of treating it as distinct.
--
-- These three have no counterpart of any kind.
--
-- *** 1. payments.attempts (provider_ref) - THE STRIPE REPLAY GUARD. ***
--
-- exchange.payment_intents is UNIQUE on payment_intent_id: one row per Stripe
-- intent, and a second insert for the same `pi_...` raises 23505. In the new
-- schema the Stripe reference lives on payments.attempts, and the only unique
-- touching a provider_ref anywhere is payments.details(provider, provider_ref)
-- - a different table, holding the INSTRUMENT rather than the attempt.
--
-- Duplicate delivery is normal on a webhook, and uniqueness is what makes a
-- replay idempotent. The update path is already safe (it UPDATEs, and the
-- settlement insert is ON CONFLICT (id)); what is not safe is createPaymentIntent
-- running twice for one Stripe intent, which exchange refuses and the new schema
-- would accept - leaving two intents, two attempts, and an update statement
-- (`WHERE a.provider_ref = $3`) that matches both. That is the same surface as
-- the standing thread where production has no record of $126.48 it was paid.
--
-- A PLAIN UNIQUE, NOT A PARTIAL ONE. Postgres treats NULLs as distinct in a
-- unique index by default, so `UNIQUE (provider_ref)` already permits any
-- number of attempts with no provider reference - it constrains exactly the
-- rows that have one. 082 added a plain index here for the access path; this
-- makes it the guard as well. 21 dev attempts, 0 duplicates, 0 nulls.
--
-- *** 2. shipping.services (carrier_id, code) - no counterpart at all. ***
--
-- exchange.carrier_services is UNIQUE on (carrier_id, code); shipping.services
-- is unique on (carrier_id, name) and on nothing involving the code. A service
-- code is what the carrier's API is called with, so two rows sharing one under
-- the same carrier is an ambiguity nothing else would catch. Free today - 8 dev
-- rows, 7 with a null code, 0 duplicates; production's 8 carrier_services rows
-- all have a null code - and a real guard once the codes are filled in.
--
-- *** 3. checkout.items (checkout_id, bullion_id) - lower stakes, and said so. ***
--
-- exchange.cart_items is UNIQUE on (cart_id, product_id): a buy cart holds one
-- line per product. checkout.items has no such index.
--
-- ONE HONEST DIFFERENCE, WRITTEN DOWN RATHER THAN GLOSSED. checkout.items
-- merges cart_items with sell_cart_items, and the SELL side never carried this
-- unique, so a plain index constrains a direction exchange left free. Three
-- things make that acceptable and they were measured, not assumed: every one of
-- the 26 production sell_cart_items rows has a NULL product_id (they are all
-- scrap lines, and NULLs are distinct in a unique index, so none is
-- constrained); the frontend's sell cart merges same-named product lines before
-- it syncs (shared/store/sellCartStore.ts, addItem and mergeSellCart both), so
-- the path that could produce a duplicate does not; and checkout.* is
-- device-sync rather than a ledger - the worst case is a rejected sync, which
-- the next one repairs, not a row that cannot be recreated.
--
-- Additive, on the new schemas only. exchange is untouched.

CREATE UNIQUE INDEX IF NOT EXISTS attempts_provider_ref_key
  ON payments.attempts (provider_ref);

CREATE UNIQUE INDEX IF NOT EXISTS services_carrier_code_key
  ON shipping.services (carrier_id, code);

CREATE UNIQUE INDEX IF NOT EXISTS checkout_items_checkout_bullion_key
  ON checkout.items (checkout_id, bullion_id);
