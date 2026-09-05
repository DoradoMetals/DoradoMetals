-- The payout becomes a payment detail, without its bank numbers.
--
-- exchange.payouts is two things at once: a bank account (or store-credit
-- instruction) and a per-order fee. They separate here - the account becomes
-- payments.details, keeping the payout's id, and the fee joins the order's other
-- fees on orders.transactions.
--
--   method               -> method_id, resolved against payments.methods on
--                           (direction 'purchase', type), under EITHER
--                           vocabulary: DORADO_ACCOUNT was called DORADO CREDIT
--                           until 109 renamed it, and which name is present
--                           depends on whether 109 or 047 got there first. The
--                           other three match under both.
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
-- encrypted, by scripts/encrypt-payout-details.ts, which refuses to run without
-- PAYOUT_ENCRYPTION_KEY - so a database can be migrated by someone who does not
-- hold the key, and the plaintext stays in exactly one place until it is dealt
-- with on its own terms.
--
-- CORRECTION, 2026-08-29: when this header was written that script DID NOT
-- EXIST, and it did not exist for the whole time this migration described it
-- in the present tense. It exists now - scripts/encrypt-payout-details.ts,
-- with shared/crypto/envelope.ts underneath it and 104 supplying the columns
-- it writes. The extension changed from .mjs because scripts/ is mid-
-- conversion to TypeScript; the citation was corrected to the file rather
-- than the file being named after the citation.
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
-- THE METHOD IS RESOLVED UNDER EITHER VOCABULARY (2026-09-06, prod-day fixes).
-- This used to be a plain join on the January spelling: DORADO_ACCOUNT mapped
-- to 'DORADO CREDIT' because that is what 047 seeded. 109 then RENAMED that row
-- to DORADO_ACCOUNT, and 047 - regenerated from dev with the same pass that
-- made it idempotent - now seeds the new name. Which spelling is present
-- depends on the ORDER: on production the chain reaches 073 before 109, so the
-- row still says 'DORADO CREDIT'; on a from-nothing build 047 has already
-- seeded the post-109 name. Accepting both, exact match first, is what makes
-- the resolution independent of that order - and a null method_id here is a
-- payout account with no method, which is a silent loss no constraint catches.
LEFT JOIN LATERAL (
  SELECT m.id
    FROM payments.methods m
   WHERE m.direction = 'purchase'
     AND m.type IN (p.method, CASE WHEN p.method = 'DORADO_ACCOUNT' THEN 'DORADO CREDIT' END)
   ORDER BY (m.type = p.method) DESC, m.id
   LIMIT 1
) m ON true
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
