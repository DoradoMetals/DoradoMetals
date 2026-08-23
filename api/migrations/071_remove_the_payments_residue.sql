-- Rule 062 applied to payments, which is where it matters most.
--
-- Production's payments schema holds 70 intents, 70 attempts, 70 settlements and
-- 56 details from the abandoned January migration. NONE of them shares an id
-- with exchange - not one of the 56 details rows corresponds to a row in
-- exchange.payouts - so by the rule Jacob set on 2026-08-23 they are residue,
-- not data: exchange is the source of truth.
--
-- Ten of those 56 details rows carry a routing number AND an account number.
--
-- That is the part worth stating plainly. FOLLOWUPS has recorded for weeks that
-- the payments migration "must not copy bank details into payments.details,
-- which would double the exposure". It already had. January copied them, and
-- production has been holding customer bank details in two places ever since -
-- exchange.payouts and payments.details - with only the first of those known
-- about.
--
-- So this migration is not only cleanup. It removes a second, undocumented copy
-- of ten customers' routing and account numbers from production.
--
-- The backfill that replaces these deliberately does NOT carry the numbers
-- across: 073 copies everything about a payout except the two columns, and they
-- are written separately, encrypted, by a script that refuses to run without
-- PAYOUT_ENCRYPTION_KEY. exchange.payouts keeps the only plaintext copy until
-- that is dealt with on its own terms.
--
-- Children before parents. Destructive to the new schema only; exchange is read
-- and not touched.

DELETE FROM payments.settlements s
WHERE NOT EXISTS (
  SELECT 1 FROM payments.attempts a
  WHERE a.id = s.attempt_id
    AND EXISTS (
      SELECT 1 FROM exchange.payment_intents e WHERE e.id = a.intent_id
    )
);

DELETE FROM payments.attempts a
WHERE NOT EXISTS (
  SELECT 1 FROM exchange.payment_intents e WHERE e.id = a.intent_id
);

DELETE FROM payments.intents i
WHERE NOT EXISTS (
  SELECT 1 FROM exchange.payment_intents e WHERE e.id = i.id
);

DELETE FROM payments.details d
WHERE NOT EXISTS (
  SELECT 1 FROM exchange.payouts p WHERE p.id = d.id
);
