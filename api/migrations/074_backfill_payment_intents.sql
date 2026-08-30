-- Payment intents, attempts and settlements, derived from exchange and Stripe.
--
-- This is the one part of the migration that is a different MODEL rather than a
-- reshaping. exchange.payment_intents is one row per Stripe intent carrying the
-- status inline; the new schema is intent -> attempt -> settlement, which
-- separates what was asked for, what was tried, and what actually moved.
--
-- WHICH INTENTS EXIST comes from exchange, by rule 062: one row per
-- exchange.payment_intents row, keeping its id.
--
-- WHETHER MONEY MOVED comes from Stripe. Jacob, 2026-08-23: "probably derive
-- from stripe." exchange records 1 of 25 production intents as succeeded;
-- payments.stripe_charges - the reconciliation table built from the Stripe
-- export - shows 8 that actually took money. exchange's payment_status was
-- never updated when the webhook fired, and it is the wrong source for this.
--
-- Stripe names its method types us_bank_account and card; payments.methods
-- calls them ACH and CARD. Mapped explicitly.
--
-- UNITS. exchange.payment_intents.amount is in CENTS - production ranges from
-- 1000 to 586026, being $10.00 to $5,860.26. payments.stripe_charges.amount is
-- in DOLLARS, 0.50 to 1248.37. Everything else in the new schema is dollars
-- (orders.transactions.total, payments.ledger.amount), so exchange's amounts are
-- divided by 100 here. Getting this backwards is a hundredfold money error, so
-- it is stated rather than inferred.
--
-- IDS. One attempt and at most one settlement per intent, because exchange holds
-- no attempt history and inventing one would be fiction. All three rows share
-- the intent's id - different tables, no collision - which makes the derivation
-- idempotent and a row directly traceable across the three.
--
-- SETTLED AMOUNT is net of refunds: what the business actually kept. A charge of
-- $1,248.37 refunded in full settles at zero. The gross and the refund are both
-- in payments.stripe_charges, joined by provider_ref, so nothing is lost.
--
-- NOT DERIVED: three Stripe charges took money and have no exchange intent at
-- all - $114.80 and $0.50 paid, and $1,248.37 charged then fully refunded. They
-- cannot become intents here because they have no order, and inventing one would
-- be worse than leaving them where they are. payments.stripe_charges IS the
-- record of them, and audit:payments reports them. See FOLLOWUPS.
--
-- exchange is only read.

-- exchange does not know how a customer will pay until they do: method_type is
-- null on 14 of 21 dev intents and 24 of 25 in production, and amount is null on
-- some. January declared method_id and the amounts NOT NULL, which asserts a
-- fact exchange has never held. Relaxed rather than filled with a default,
-- because a defaulted payment method is a lie about how someone paid.
ALTER TABLE payments.intents  ALTER COLUMN method_id       DROP NOT NULL;
ALTER TABLE payments.intents  ALTER COLUMN amount_expected DROP NOT NULL;
ALTER TABLE payments.attempts ALTER COLUMN method_id       DROP NOT NULL;
ALTER TABLE payments.attempts ALTER COLUMN amount          DROP NOT NULL;

-- Guard ---------------------------------------------------------------
DO $$
DECLARE
  offender text;
BEGIN
  SELECT string_agg(t, ', ') INTO offender FROM (
    SELECT 'payments.intents' t WHERE EXISTS (
      SELECT 1 FROM payments.intents i
      WHERE NOT EXISTS (SELECT 1 FROM exchange.payment_intents e WHERE e.id = i.id))
  ) x;

  IF offender IS NOT NULL THEN
    RAISE EXCEPTION
      'refusing to backfill payment intents: % holds rows exchange does not, so a switch has been promoted past dual and exchange is no longer authoritative.',
      offender;
  END IF;
END $$;

-- The intent: what was asked for.
--
-- `type` IS CARRIED HERE, NOT LEFT TO 076. It was: this insert omitted the
-- column and 076 filled it two migrations later, which worked only while
-- payments.intents.type was nullable. 102 made it NOT NULL - exchange.
-- payment_intents.type always was - and genesis carries the finished shape, so
-- on a build from nothing this INSERT is the first statement to run against the
-- constraint and it raised 23502 before 076 ever got its turn. 076 still runs
-- and is still correct; it now updates a value that already matches.
--
-- Edited rather than left, on the same reasoning 031 records for 086: an old
-- backfill is part of the build-from-nothing path, and a later schema change
-- that breaks it breaks production's first migration run, not dev's.
INSERT INTO payments.intents (id, order_id, method_id, amount_expected, status, type, created_at, updated_at)
SELECT
  e.id,
  (SELECT o.id FROM orders.orders o
    WHERE o.id = coalesce(e.sales_order_id, e.purchase_order_id)),
  m.id,
  e.amount / 100.0,
  -- Stripe's word where there is one, exchange's otherwise.
  coalesce(
    CASE
      WHEN c.amount_refunded > 0 THEN 'refunded'
      WHEN c.captured THEN 'succeeded'
      ELSE NULL
    END,
    e.payment_status
  ),
  e.type,
  e.created_at,
  e.updated_at
FROM exchange.payment_intents e
LEFT JOIN payments.stripe_charges c ON c.payment_intent_id = e.payment_intent_id
LEFT JOIN payments.methods m
  ON m.direction = 'sale'
 AND m.type = CASE e.method_type
                WHEN 'us_bank_account' THEN 'ACH'
                WHEN 'card' THEN 'CARD'
                ELSE upper(e.method_type)
              END
ON CONFLICT (id) DO UPDATE SET
  order_id        = EXCLUDED.order_id,
  method_id       = EXCLUDED.method_id,
  amount_expected = EXCLUDED.amount_expected,
  status          = EXCLUDED.status,
  type            = EXCLUDED.type,
  updated_at      = EXCLUDED.updated_at;

-- The attempt: what was tried, and through whom.
INSERT INTO payments.attempts (id, intent_id, method_id, provider, provider_ref, amount, status)
SELECT
  e.id, e.id, m.id, 'stripe', e.payment_intent_id, e.amount / 100.0,
  coalesce(
    CASE
      WHEN c.amount_refunded > 0 THEN 'refunded'
      WHEN c.captured THEN 'succeeded'
      ELSE NULL
    END,
    e.payment_status
  )
FROM exchange.payment_intents e
LEFT JOIN payments.stripe_charges c ON c.payment_intent_id = e.payment_intent_id
LEFT JOIN payments.methods m
  ON m.direction = 'sale'
 AND m.type = CASE e.method_type
                WHEN 'us_bank_account' THEN 'ACH'
                WHEN 'card' THEN 'CARD'
                ELSE upper(e.method_type)
              END
WHERE e.payment_intent_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM payments.intents i WHERE i.id = e.id)
ON CONFLICT (id) DO UPDATE SET
  method_id    = EXCLUDED.method_id,
  provider_ref = EXCLUDED.provider_ref,
  amount       = EXCLUDED.amount,
  status       = EXCLUDED.status;

-- The settlement: what actually moved, net of refunds. Only where Stripe says
-- the charge was captured.
INSERT INTO payments.settlements (id, attempt_id, settled_amount, provider, provider_ref, settled_at)
SELECT
  e.id, e.id,
  c.amount - coalesce(c.amount_refunded, 0),
  'stripe', c.charge_id, c.created_at
FROM exchange.payment_intents e
JOIN payments.stripe_charges c ON c.payment_intent_id = e.payment_intent_id
WHERE c.captured
  AND EXISTS (SELECT 1 FROM payments.attempts a WHERE a.id = e.id)
ON CONFLICT (id) DO UPDATE SET
  settled_amount = EXCLUDED.settled_amount,
  provider_ref   = EXCLUDED.provider_ref,
  settled_at     = EXCLUDED.settled_at;
