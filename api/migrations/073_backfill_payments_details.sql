-- The payout becomes a payment detail, without its bank numbers.
--
-- exchange.payouts is two things at once: a bank account (or store-credit
-- instruction) and a per-order fee. They separate here - the account becomes
-- payments.details, keeping the payout's id, and the fee joins the order's other
-- fees on orders.transactions.
--
--   method               -> method_id, resolved against payments.methods on
--                           (direction 'purchase', type). DORADO_ACCOUNT is
--                           called DORADO CREDIT there; the other three match.
--   account_holder_name  -> account_holder
--   order_id             -> not carried. payments.details describes an account,
--                           and the same account serves many orders; the order
--                           link lives on payments.intents.
--   cost                 -> orders.transactions.payout_fee
--
-- routing_number and account_number are DELIBERATELY NOT COPIED.
--
-- They are the only plaintext bank details the business holds, on 18 production
-- payouts. January copied them into payments.details and 071 removed that copy.
-- Writing them again here would put them back. They are written separately, and
-- encrypted, by scripts/encrypt-payout-details.mjs, which refuses to run without
-- PAYOUT_ENCRYPTION_KEY - so a database can be migrated by someone who does not
-- hold the key, and the plaintext stays in exactly one place until it is dealt
-- with on its own terms.
--
-- Idempotent. exchange is only read.

-- Guard ---------------------------------------------------------------
DO $$
DECLARE
  offender text;
BEGIN
  SELECT string_agg(t, ', ') INTO offender FROM (
    -- A details row comes from one of two places: a payout, which keeps its id,
    -- or a payer's card, which 078 derives from the intent that used it. The
    -- guard has to know about both, or it refuses its own successor's work on
    -- the second run.
    SELECT 'payments.details' t WHERE EXISTS (
      SELECT 1 FROM payments.details d
      WHERE NOT EXISTS (SELECT 1 FROM exchange.payouts p WHERE p.id = d.id)
        AND NOT EXISTS (SELECT 1 FROM exchange.payment_intents e WHERE e.id = d.id))
  ) x;

  IF offender IS NOT NULL THEN
    RAISE EXCEPTION
      'refusing to backfill payment details: % holds rows exchange does not, so a switch has been promoted past dual and exchange is no longer authoritative.',
      offender;
  END IF;
END $$;

INSERT INTO payments.details (
  id, user_id, method_id, account_holder, bank_name, account_type,
  email_to, created_at, updated_at
)
SELECT
  p.id,
  p.user_id,
  m.id,
  p.account_holder_name,
  p.bank_name,
  p.account_type,
  p.email_to,
  p.created_at,
  p.created_at
FROM exchange.payouts p
LEFT JOIN payments.methods m
  ON m.direction = 'purchase'
 AND m.type = CASE p.method WHEN 'DORADO_ACCOUNT' THEN 'DORADO CREDIT' ELSE p.method END
WHERE p.user_id IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
  user_id        = EXCLUDED.user_id,
  method_id      = EXCLUDED.method_id,
  account_holder = EXCLUDED.account_holder,
  bank_name      = EXCLUDED.bank_name,
  account_type   = EXCLUDED.account_type,
  email_to       = EXCLUDED.email_to,
  updated_at     = EXCLUDED.updated_at;

-- The fee, onto the order it was charged against.
UPDATE orders.transactions t
SET payout_fee = p.cost
FROM exchange.payouts p
WHERE t.order_id = p.order_id
  AND t.payout_fee IS DISTINCT FROM p.cost;
