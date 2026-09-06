-- One label per mailer in the Figma "Media" page (ruling 95).
--
-- The mailers were rebuilt from the design and the trail has to be able to
-- file each of them. `media.email_kind` held five labels and the design has
-- thirteen mailers; ten of them had nowhere to be recorded, so their sends
-- could not be counted, could not be replayed and - for the reminder job -
-- could not be made idempotent, because idempotency IS the trail.
--
-- Which labels are NOT here, and why:
--
--   Order received is direction-aware and keeps BOTH existing labels,
--   `purchase_order_created` and `sales_order_created`. One mailer, two kinds,
--   because the kind is what says which side of the business the row belongs
--   to and 136 split them on purpose.
--
--   `auth_verification` stays. The sign-in code mailer files under
--   `sign_in_code`, but the verify/reset/change-email templates are still
--   live until the passwordless-auth lane deletes them, and their rows are
--   already written under the old label. An enum label cannot be removed
--   without rewriting every row that carries it, which is a destructive edit
--   this project does not make for tidiness.
--
--   `promo` is a template with no trigger - marketing is later - and it is
--   here anyway so that the day someone wires it, the send can be recorded
--   rather than the enum being the thing that blocks it.
--
-- Additive and new-schema only: labels appended to one enum in the `media`
-- schema, no table touched, no row rewritten, `exchange` untouched. Every
-- statement is IF NOT EXISTS, so the replay is a no-op on a database whose
-- 000_genesis_schema.sql already carries the labels after dump:schema.
--
-- ROLLBACK: none needed and none possible in place - an unused enum label
-- costs nothing and PostgreSQL has no DROP VALUE. If these labels had to go,
-- the type would be recreated and the column recast, which is the destructive
-- shape this file deliberately avoids.

ALTER TYPE media.email_kind ADD VALUE IF NOT EXISTS 'sign_in_code';
ALTER TYPE media.email_kind ADD VALUE IF NOT EXISTS 'account_created';
ALTER TYPE media.email_kind ADD VALUE IF NOT EXISTS 'details_changed';
ALTER TYPE media.email_kind ADD VALUE IF NOT EXISTS 'payout_sent';
ALTER TYPE media.email_kind ADD VALUE IF NOT EXISTS 'shipment_sent';
ALTER TYPE media.email_kind ADD VALUE IF NOT EXISTS 'shipment_received';
ALTER TYPE media.email_kind ADD VALUE IF NOT EXISTS 'pickup_booked';
ALTER TYPE media.email_kind ADD VALUE IF NOT EXISTS 'pickup_complete';
ALTER TYPE media.email_kind ADD VALUE IF NOT EXISTS 'appointment_booked';
ALTER TYPE media.email_kind ADD VALUE IF NOT EXISTS 'appointment_tomorrow';
ALTER TYPE media.email_kind ADD VALUE IF NOT EXISTS 'document_sent';
ALTER TYPE media.email_kind ADD VALUE IF NOT EXISTS 'promo';
