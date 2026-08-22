-- Reassembles the exchange.mints shape from the two tables that now hold it.
--
-- The parity check compares a source table against a single target. A mint is
-- no longer a single row - description and website live on the organization -
-- so there is nothing to point it at without this view. Same pattern as
-- refiners.exchange_compat and shipping.carriers_exchange_compat.
--
-- The timestamps are converted back to naive UTC so the comparison is like for
-- like: products.mints stores timestamptz where exchange stored timestamp, and
-- comparing the two directly would either fail or, worse, pass by accident
-- because the process happens to run in UTC.
--
-- Read-only. Nothing writes through it.

CREATE OR REPLACE VIEW products.mints_exchange_compat AS
SELECT
  mint.id,
  mint.name,
  mint.type,
  mint.country,
  org.description,
  org.website,
  mint.created_at AT TIME ZONE 'UTC' AS created_at,
  mint.updated_at AT TIME ZONE 'UTC' AS updated_at
FROM products.mints mint
JOIN organizations.organizations org ON org.id = mint.organization_id;
