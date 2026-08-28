-- One default shipping address per person, enforced by the database.
--
-- setDefault clears the user's other links and then sets one, and that code
-- path is the ONLY thing keeping the invariant - a bug or a concurrent write
-- could leave two defaults, and the frontend picks whichever sorts first.
-- The schema review during the addresses wire split (2026-08-27) found no
-- constraint saying what the code means. A partial unique index says it.
--
-- New schema only; exchange keeps its own is_default column untouched.
-- Safe on existing data: dev and the backfill derive defaults from
-- exchange.addresses.is_default, which exchange's own code kept unique per
-- user the same clear-then-set way.

CREATE UNIQUE INDEX IF NOT EXISTS user_addresses_one_default_per_user
  ON places.user_addresses (user_id)
  WHERE default_shipping;
