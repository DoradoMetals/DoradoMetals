-- A FULFILLMENT CAN NOW EXIST BEFORE ITS ORDER (D208 - the checkout-row flow).
--
-- Jacob's design for the checkout conversion: the fulfillment is a LIVE DRAFT
-- during checkout - "each time an option is changed/added, the server-side
-- fulfillment gets updated, and checkout stores the fulfillment id" - and
-- order creation attaches it rather than composing one from a request body.
--
-- order_id therefore becomes nullable: a draft has no order yet. The UNIQUE
-- index on order_id is untouched - btree uniqueness ignores NULLs, so any
-- number of drafts coexist while one-fulfillment-per-order still holds the
-- moment an order is attached. Every existing read in features/fulfillments
-- joins through order_id, so drafts are invisible to order-facing surfaces by
-- construction.
--
-- checkout.checkouts gains the pointer to its draft. ON DELETE SET NULL: a
-- draft that is deleted (or attached and later cascaded away with its order)
-- must not take the customer's cart with it.
--
-- What this makes REDUNDANT, recorded rather than dropped: January put
-- fulfillment-child data on the checkout row itself (fulfillment_method_id,
-- pickup_address_id, appointment_location_id, appointment_time). Under the
-- draft model those live on the fulfillment and its children. The columns are
-- all-NULL and nothing reads them; they stay until the checkout conversion is
-- proven, then leave with their own migration.

ALTER TABLE fulfillments.fulfillments ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE checkout.checkouts
  ADD COLUMN IF NOT EXISTS fulfillment_id uuid
    REFERENCES fulfillments.fulfillments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS checkouts_fulfillment_idx
  ON checkout.checkouts (fulfillment_id) WHERE fulfillment_id IS NOT NULL;
