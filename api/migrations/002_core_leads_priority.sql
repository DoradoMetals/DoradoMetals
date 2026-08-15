-- Bring core.leads level with exchange.leads.
--
-- The core schema was built in January and exchange has moved since; `priority`
-- was added to exchange afterwards and never reached core. Every other column
-- matches on name, type and nullability.
--
-- Additive and idempotent. Nothing reads core.leads yet, so this cannot affect
-- serving traffic.

ALTER TABLE core.leads
  ADD COLUMN IF NOT EXISTS priority text;
