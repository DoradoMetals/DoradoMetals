-- WHAT A PARCEL MAY BE INSURED FOR STOPS BEING A NUMBER IN THE BROWSER. D132.
--
-- `frontend/features/checkout/purchase-order-checkout/checkoutStepper.tsx:67`
-- was `Math.min(quote.declared_value, 50000)`: a ceiling on what the business
-- is covered for if a parcel of metal is lost, hard-coded in React. Two
-- defects in one expression - the browser computing money (D82), and a limit
-- that is not ours spelled as a literal so that changing it needs a deploy.
--
-- Jacob, 2026-08-29: "Services should include max insured value on
-- shipping.services, make it 10,000 for all of them at the moment." So the
-- ceiling becomes a column, and 10,000 is a BUSINESS policy, deliberately well
-- under FedEx's own $50,000 declared-value ceiling.
--
-- *** WHY THIS IS NOT `max_declared_value`, WHICH ALREADY EXISTS. *** That
-- column is the CARRIER's stated ceiling and it is dual-written: it is one of
-- the 23 values `features/shipping/services/service.ts` feeds to BOTH
-- shipping.services and exchange.carrier_services from a single array. Seeding
-- it here would either put 10,000 into a column that means "what FedEx allows"
-- (it is 50,000, not 10,000), or force an UPDATE against exchange to keep the
-- pair level - and migrations do not write exchange. This is Dorado's own
-- policy limit, it exists only on the new schema, and it has no exchange
-- counterpart to diverge from. Two columns, two facts.
--
-- NOT NULL DEFAULT 10000 seeds all eight existing rows in the ALTER itself,
-- which is the whole of the "make it 10,000 for all of them" instruction. It
-- is NOT NULL because a null ceiling has no safe reading: the code would have
-- to choose between "uninsurable" and "unlimited" and both are wrong.
--
-- Additive, on the new schema only. exchange.carrier_services is untouched.
ALTER TABLE shipping.services
  ADD COLUMN IF NOT EXISTS max_insured_value numeric NOT NULL DEFAULT 10000;

COMMENT ON COLUMN shipping.services.max_insured_value IS
  'Dorado''s own ceiling on what a parcel moving on this service may be insured for, in USD. Not the carrier''s limit - that is max_declared_value. Read server-side by features/shipping/services/service.ts; the browser never sees it.';
