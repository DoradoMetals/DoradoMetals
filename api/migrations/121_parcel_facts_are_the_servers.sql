-- RULING 58 (Jacob, 2026-09-03): "We don't care about packaging weight on
-- the frontend. Why would it live here?" 113 put package_weight and
-- declared_value on checkout.checkouts because the CLIENT computed them and
-- something had to hold the number until placement. Neither is true any
-- more: domain/shipping/rules.ts computes both fresh from the checkout's own
-- items and package at quote time and at label time, so nothing needs them
-- PERSISTED between requests.
--
-- checkout.checkouts is device-sync, not a ledger (CLAUDE.md) - losing an
-- in-flight step's cached numbers is fine, and lint:migrations guards only
-- `exchange`, which this schema is not.
ALTER TABLE checkout.checkouts
  DROP COLUMN IF EXISTS package_weight,
  DROP COLUMN IF EXISTS declared_value;
