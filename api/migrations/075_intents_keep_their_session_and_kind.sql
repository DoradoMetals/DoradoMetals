-- payments.intents needs the three columns I said had no home.
--
-- 074 declared session_id, user_id and type as deliberately dropped. That was
-- wrong, and writing the payments repo split is what showed it:
-- retrievePaymentIntent - the read that decides whether to reuse a Stripe intent
-- or open a new one - keys on all three at once.
--
--   WHERE session_id = $1 AND user_id = $2 AND type = $3
--         AND payment_status NOT IN ('succeeded','processing','canceled')
--
-- Without them the new schema cannot answer that question at all, so the feature
-- could not have been split. Declaring a column dropped because nothing obvious
-- reads it is only safe when something has actually looked, and I had looked at
-- the data rather than the code.
--
-- All three are populated in production: 25 of 25 user_id and type, 16 of 25
-- session_id - a checkout session exists only where the customer got that far.
--
-- user_id is a real column here rather than reached through the order, because
-- an intent can exist before there is an order: `type` is 'admin' on 6 of 25
-- production rows, which is an admin taking a payment with no sales order
-- attached. Reaching for it through order_id would lose those.
--
-- Additive and nullable. exchange is untouched.

ALTER TABLE payments.intents
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS user_id    uuid,
  ADD COLUMN IF NOT EXISTS type       text;

-- The read filters on the trio, so it wants an index on the trio.
CREATE INDEX IF NOT EXISTS idx_intents_session_user_type
  ON payments.intents (session_id, user_id, type);
