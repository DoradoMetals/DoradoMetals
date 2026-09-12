-- Ruling 112 as amended (Jacob, 2026-09-12): a refusal is one of three classes.
-- Blocked is a data error and stays a throw. Confirm is business judgment and
-- becomes a reason beside the action. OVERRIDE is serious money - a second
-- payout on an order that already has one moving, or an amount above what the
-- order owes - "made as hard as possible, but possible": a fresh step-up on the
-- session AND a written reason, stored on the transfer.
--
-- `override_reason` is that reason. It is on the transfer because the transfer
-- is the row the money left on, and because the partial unique index that
-- enforces one live payment per order and kind has to be able to see it: a
-- deliberate override is exempt, an accidental double is not.
--
-- 150 created `transfers_one_live_per_order_kind ON (order_id, kind) WHERE
-- state <> 'Failed'`. It is replaced by the same index with
-- `AND override_reason IS NULL`, so the second transfer is refused by the
-- database unless it carries a written reason - which the API only accepts from
-- a stepped-up session.
--
-- Additive; the index is narrowed, never widened, for rows that carry no
-- reason. `exchange` is neither read nor written.

ALTER TABLE payments.transfers
  ADD COLUMN IF NOT EXISTS override_reason text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transfers_override_reason_said_something') THEN
    ALTER TABLE payments.transfers ADD CONSTRAINT transfers_override_reason_said_something
      CHECK (override_reason IS NULL OR length(btrim(override_reason)) >= 10);
  END IF;
END $$;

DROP INDEX IF EXISTS payments.transfers_one_live_per_order_kind;

CREATE UNIQUE INDEX IF NOT EXISTS transfers_one_live_per_order_kind
  ON payments.transfers (order_id, kind)
  WHERE state <> 'Failed' AND override_reason IS NULL;
