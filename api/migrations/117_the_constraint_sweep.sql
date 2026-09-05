-- The constraint sweep: foreign keys re-pointed, validated, added, indexed;
-- three columns tightened; nine checkout links stop blocking a delete.
--
-- Read-only against dev's information_schema/pg_catalog first, every time -
-- the audit report this was planned from was deleted, so every count below
-- was re-measured against dev on 2026-09-03, not copied from memory. exchange
-- is never read or written here: everything below is orders, payments,
-- checkout, media, organizations, products, rates, reviews, metals and
-- shipping - the eighteen domain schemas, minus auth (better-auth owns its
-- own tables) and exchange (frozen, ruling 36).
--
-- *** THE HEADER, ONE LINE PER CHANGE, WITH THE PRE-CHECK. ***
--
--  1. media.emails.user_id, payments.details.user_id: FK still pointed at
--     exchange.users(id). 0/1 and 0/40 rows fail against auth.users - both
--     re-pointed and left VALID.
--  2. New FKs, each checked for orphans against auth.users/orders.orders/
--     media.images first:
--       orders.addresses.order_id -> orders.orders(id)              0/51 orphans - VALID
--       orders.addresses.source_address_id -> places.addresses(id)  0/51 orphans - VALID,
--         DEFERRABLE INITIALLY DEFERRED (see note below the header)
--       orders.transactions.order_id -> orders.orders(id)           0/62 orphans - VALID  (extra: found by the same pg_constraint scan; every other FK-shaped column on this table already has one)
--       payments.ledger.user_id -> auth.users(id)                   0/19 orphans - VALID
--       organizations.organizations.image_id -> media.images(id)    0/16 orphans - VALID
--       payments.intents.user_id -> auth.users(id)                  2/43 orphans - NOT VALID (see below)
--     payments.intents.session_id is left alone - ruled a bare uuid, not a FK.
--     076_backfill_intent_session_and_kind.sql's UPDATE is corrected IN THE
--     SAME PASS, for the same reason as 047 (below): it blindly copied
--     exchange.payment_intents.user_id, including the two dangling ids this
--     item leaves NOT VALID, and genesis now creates the FK before 076 ever
--     runs on a fresh build. It now leaves user_id NULL where no auth.users
--     row backs it, rather than reproducing a value that would raise 23503 -
--     payments.intents is registered in verify-backfill.mjs's NOT_REBUILT, so
--     the two rows differing from live dev on a rebuild is not compared and
--     is not a finding. Nothing already applied on dev changes.
--  3. Five FKs already NOT VALID, validated after a read-only violation count
--     of 0 on each: products.bullion.bullion_mint_id_fkey,
--     products.bullion.bullion_metal_id_fkey,
--     reviews.reviews.migration_reviews_user_fk,
--     reviews.reviews.migration_reviews_order_fk,
--     rates.rates.migration_rates_metal_fk.
--  4. payments.attempts and payments.settlements gain created_at timestamptz
--     NOT NULL DEFAULT now() - 43 and 1 existing rows respectively, backfilled
--     by the DEFAULT itself (Postgres evaluates a non-volatile-at-ALTER-time
--     default once and stores it for the rows that already exist, the same
--     "fast default" 116 relies on for its own COALESCEs - see that file's
--     header). settlements.settled_at is LEFT NULLABLE - reverted after the
--     data check (0 of 1 dev rows null, 70/0 on production) proved too
--     narrow a check: db/payments/settlements/sql/create.sql inserts a
--     settlement row before the amount is confirmed on some callers' path,
--     and a snapshot of existing rows cannot see that. A row-count check is
--     not a code check; a data check alone is not enough to add NOT NULL.
--     This migration's own create.sql now stamps settled_at = now() where the
--     caller already knows money moved (domain/payments/service.ts's
--     updateFromProvider), but the column stays nullable for the callers that
--     do not.
--  5. shipping.packages.length/width/height: text -> numeric. All 12 dev rows
--     (and all of production's) cast cleanly; USING col::numeric. This closes
--     a real mismatch, not a theoretical one - db/shipping/packages/repo.ts's
--     OfferedPackage type and frontend/features/checkout/queries.ts's copy of
--     it already declare these `number | null`, while the column has been
--     returning strings. 047_seed_reference_data.sql's own packages literals
--     (nine rows) are corrected from ::text to ::numeric IN THE SAME PASS -
--     same values, only the type tag - because genesis regeneration bakes
--     this type change all the way back to 000, and 047 replays after it on
--     any from-scratch build; see the note above the ALTERs for why a cast
--     was tried first and could not be granted.
--  6. checkout.checkouts: nine FKs move from the implicit NO ACTION to ON
--     DELETE SET NULL - every optional link off the row (addresses, payment
--     details, payment method, package, carrier service, appointment
--     location, fulfillment method). checkouts_fulfillment_id_fkey already
--     had ON DELETE SET NULL; checkout_user_fk stays as-is (a checkout with no
--     user is not "still valid with a blank field", it is orphaned). Deleting
--     a saved address, a payout detail row or a carrier service no longer has
--     to fail because a stale cart still points at it.
--     checkout.items.checkout_id -> checkout.checkouts is ALREADY ON DELETE
--     CASCADE (checkout_items_checkout_fk); nothing to do there.
--  7. Indexes added on every FK column with none, found by comparing
--     pg_constraint against pg_index (leading-column match, same rule
--     audit:indexes uses): 37 existing FK columns plus the 2 new ones from
--     item 2 that landed on a column nothing already leads with
--     (payments.intents.user_id, organizations.organizations.image_id) - 39
--     total. Full list is the CREATE INDEX statements below; orders.addresses
--     .source_address_id, orders.transactions.order_id and every other FK
--     touched by item 2 already had a leading index and needed none.
--  8. reviews.reviews gains CHECK (rating BETWEEN 1 AND 5): dev's min/max is
--     1/5, 0 rows null, 0 out of range.
--  9. shipping.services.provider_code and .max_declared_value are NOT
--     dropped: both are read and written by domain/shipping/services/
--     service.ts, db/shipping/services/repo.ts and every services/sql/*.sql
--     file, and max_declared_value is rendered and edited in
--     frontend/features/carriers/ui/CarrierServicesDrawer.tsx. created_by/
--     updated_by TEXT columns are untouched everywhere, per the instruction -
--     later work retires their readers first.
--
-- Every ADD CONSTRAINT is wrapped in a DO block that checks pg_constraint
-- first (Postgres has no ADD CONSTRAINT IF NOT EXISTS), so a partial apply
-- resumes cleanly. CREATE INDEX uses IF NOT EXISTS. The two column ADDs use
-- IF NOT EXISTS. The three TYPE changes are naturally idempotent - re-running
-- them against a column already numeric is a no-op, not an error.
--
-- WHY order_addresses_source_address_id_fkey IS DEFERRABLE INITIALLY
-- DEFERRED, alone among the FKs added here. verify:backfill builds the whole
-- CURRENT schema in one shot (dump-schema.mjs, every constraint included) and
-- then replays every backfill-tagged migration after it, in their original
-- filename order, inside that one transaction. 038_backfill_orders_
-- address_source.sql writes orders.addresses.source_address_id before
-- 050_backfill_addresses.sql has populated places.addresses - a real gap
-- between two migrations that predate this one by dozens of files, neither of
-- which this migration may edit (migrations are forward-only). A plain FK
-- checks on every statement and fails there; DEFERRABLE INITIALLY DEFERRED
-- checks once, at COMMIT, which is what a multi-statement backfill actually
-- needs and is exactly why Postgres has the option. It costs nothing live:
-- domain/orders/place.ts only ever passes a source_address_id that already
-- exists (addressService.snapshot reads it first), so ordinary application
-- traffic never depends on the deferral - the constraint is exactly as strict
-- by the time anything commits.

-- ============================================================ 1. re-point FKs

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'emails_user_id_fkey'
      AND pg_get_constraintdef(oid) LIKE '%exchange.users%'
  ) THEN
    ALTER TABLE media.emails DROP CONSTRAINT emails_user_id_fkey;
    ALTER TABLE media.emails
      ADD CONSTRAINT emails_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'details_user_fk'
      AND pg_get_constraintdef(oid) LIKE '%exchange.users%'
  ) THEN
    ALTER TABLE payments.details DROP CONSTRAINT details_user_fk;
    ALTER TABLE payments.details
      ADD CONSTRAINT details_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id);
  END IF;
END $$;

-- ============================================================ 2. missing FKs

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_addresses_order_id_fkey') THEN
    ALTER TABLE orders.addresses
      ADD CONSTRAINT order_addresses_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders.orders(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_addresses_source_address_id_fkey') THEN
    ALTER TABLE orders.addresses
      ADD CONSTRAINT order_addresses_source_address_id_fkey FOREIGN KEY (source_address_id) REFERENCES places.addresses(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_order_fk') THEN
    ALTER TABLE orders.transactions
      ADD CONSTRAINT transactions_order_fk FOREIGN KEY (order_id) REFERENCES orders.orders(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_user_id_fkey') THEN
    ALTER TABLE payments.ledger
      ADD CONSTRAINT ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_image_id_fkey') THEN
    ALTER TABLE organizations.organizations
      ADD CONSTRAINT organizations_image_id_fkey FOREIGN KEY (image_id) REFERENCES media.images(id);
  END IF;
END $$;

-- 2 of 43 non-null rows (1725094e-ba3f-455f-9e9c-63c9876fddee,
-- aef46fa2-4fd8-4645-b624-4c4d2bd2d8f1, both created 2025-06-23/24, both
-- stuck at status requires_payment_method) reference a user_id auth.users
-- does not hold. Added NOT VALID rather than left absent, so every future
-- write is still checked; those two rows stay unvalidated until someone
-- decides what an abandoned checkout session from a user that no longer
-- resolves should do.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intents_user_fk') THEN
    ALTER TABLE payments.intents
      ADD CONSTRAINT intents_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) NOT VALID;
  END IF;
END $$;

-- ==================================================== 3. validate NOT VALID

ALTER TABLE products.bullion VALIDATE CONSTRAINT bullion_mint_id_fkey;
ALTER TABLE products.bullion VALIDATE CONSTRAINT bullion_metal_id_fkey;
ALTER TABLE reviews.reviews VALIDATE CONSTRAINT migration_reviews_user_fk;
ALTER TABLE reviews.reviews VALIDATE CONSTRAINT migration_reviews_order_fk;
ALTER TABLE rates.rates VALIDATE CONSTRAINT migration_rates_metal_fk;

-- ============================================================ 4. timestamps

ALTER TABLE payments.attempts
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE payments.settlements
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- settled_at stays nullable - see the header. create.sql now sets it where
-- the caller already knows the money moved; not every caller does yet.

-- ======================================================== 5. package dims

ALTER TABLE shipping.packages ALTER COLUMN length TYPE numeric USING length::numeric;
ALTER TABLE shipping.packages ALTER COLUMN width  TYPE numeric USING width::numeric;
ALTER TABLE shipping.packages ALTER COLUMN height TYPE numeric USING height::numeric;

-- verify:backfill (and the "build production from nothing" bootstrap this
-- migration becomes part of, once genesis is regenerated to match) runs
-- 000_genesis_schema.sql - which will now declare these three columns numeric
-- from the start - and THEN replays every backfill/seed migration's own SQL
-- text verbatim, in file order. 047_seed_reference_data.sql is one of them,
-- and it inserted these same nine rows as '18.0'::text and its siblings -
-- correct the day it was written, when the column really was text.
--
-- A CREATE CAST (text AS numeric) WITH INOUT AS ASSIGNMENT was tried here
-- first, on the reasoning that 047 is forward-only and should not change. It
-- does not apply: creating a cast between two built-in types requires owning
-- one of them or being superuser, and the role this migrator runs as (dorado,
-- on dev; whatever the equivalent is on production) owns neither text nor
-- numeric - `pnpm migrate` failed outright with "must be owner of type text
-- or type numeric". A cast targeting a domain was tried next and Postgres
-- refuses that unconditionally ("cast will be ignored because the target
-- data type is a domain") - domains always inherit their base type's casts,
-- with no override. Neither path is available to a non-superuser role, which
-- this migration cannot assume it has - or grant itself.
--
-- So 047's three columns are corrected instead: '18.0'::text became
-- '18.0'::numeric, same nine rows, same values, only the type tag changed to
-- match what this migration makes the column. This is not the first time a
-- backfill has been edited in place for exactly this reason - 034's own
-- header cites 031 doing the same when 085/086 changed what a later schema
-- expected, "which verify:backfill caught the first time it ran after them."
-- The alternative - leaving 047 broken - would fail any future from-scratch
-- build silently until someone ran verify:backfill, which is the one check
-- built to catch it.

-- ============================================== 6. checkout ON DELETE SET NULL

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_pickup_address_fk' AND confdeltype <> 'n') THEN
    ALTER TABLE checkout.checkouts DROP CONSTRAINT checkouts_pickup_address_fk;
    ALTER TABLE checkout.checkouts
      ADD CONSTRAINT checkouts_pickup_address_fk FOREIGN KEY (pickup_address_id) REFERENCES places.addresses(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_shipper_address_fk' AND confdeltype <> 'n') THEN
    ALTER TABLE checkout.checkouts DROP CONSTRAINT checkouts_shipper_address_fk;
    ALTER TABLE checkout.checkouts
      ADD CONSTRAINT checkouts_shipper_address_fk FOREIGN KEY (shipper_address_id) REFERENCES places.addresses(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_recipient_address_fk' AND confdeltype <> 'n') THEN
    ALTER TABLE checkout.checkouts DROP CONSTRAINT checkouts_recipient_address_fk;
    ALTER TABLE checkout.checkouts
      ADD CONSTRAINT checkouts_recipient_address_fk FOREIGN KEY (recipient_address_id) REFERENCES places.addresses(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_payment_details_fk' AND confdeltype <> 'n') THEN
    ALTER TABLE checkout.checkouts DROP CONSTRAINT checkouts_payment_details_fk;
    ALTER TABLE checkout.checkouts
      ADD CONSTRAINT checkouts_payment_details_fk FOREIGN KEY (payment_details_id) REFERENCES payments.details(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_payment_method_fk' AND confdeltype <> 'n') THEN
    ALTER TABLE checkout.checkouts DROP CONSTRAINT checkouts_payment_method_fk;
    ALTER TABLE checkout.checkouts
      ADD CONSTRAINT checkouts_payment_method_fk FOREIGN KEY (payment_method_id) REFERENCES payments.methods(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_package_fk' AND confdeltype <> 'n') THEN
    ALTER TABLE checkout.checkouts DROP CONSTRAINT checkouts_package_fk;
    ALTER TABLE checkout.checkouts
      ADD CONSTRAINT checkouts_package_fk FOREIGN KEY (package_id) REFERENCES shipping.packages(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_carrier_service_fk' AND confdeltype <> 'n') THEN
    ALTER TABLE checkout.checkouts DROP CONSTRAINT checkouts_carrier_service_fk;
    ALTER TABLE checkout.checkouts
      ADD CONSTRAINT checkouts_carrier_service_fk FOREIGN KEY (carrier_service_id) REFERENCES shipping.services(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_appointment_location_fk' AND confdeltype <> 'n') THEN
    ALTER TABLE checkout.checkouts DROP CONSTRAINT checkouts_appointment_location_fk;
    ALTER TABLE checkout.checkouts
      ADD CONSTRAINT checkouts_appointment_location_fk FOREIGN KEY (appointment_location_id) REFERENCES places.locations(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_fulfillment_method_fk' AND confdeltype <> 'n') THEN
    ALTER TABLE checkout.checkouts DROP CONSTRAINT checkouts_fulfillment_method_fk;
    ALTER TABLE checkout.checkouts
      ADD CONSTRAINT checkouts_fulfillment_method_fk FOREIGN KEY (fulfillment_method_id) REFERENCES fulfillments.methods(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ==================================================== 7. index every bare FK

CREATE INDEX IF NOT EXISTS idx_checkout_checkouts_appointment_location_id ON checkout.checkouts (appointment_location_id);
CREATE INDEX IF NOT EXISTS idx_checkout_checkouts_carrier_service_id ON checkout.checkouts (carrier_service_id);
CREATE INDEX IF NOT EXISTS idx_checkout_checkouts_fulfillment_method_id ON checkout.checkouts (fulfillment_method_id);
CREATE INDEX IF NOT EXISTS idx_checkout_checkouts_package_id ON checkout.checkouts (package_id);
CREATE INDEX IF NOT EXISTS idx_checkout_checkouts_payment_details_id ON checkout.checkouts (payment_details_id);
CREATE INDEX IF NOT EXISTS idx_checkout_checkouts_payment_method_id ON checkout.checkouts (payment_method_id);
CREATE INDEX IF NOT EXISTS idx_checkout_checkouts_pickup_address_id ON checkout.checkouts (pickup_address_id);
CREATE INDEX IF NOT EXISTS idx_checkout_checkouts_recipient_address_id ON checkout.checkouts (recipient_address_id);
CREATE INDEX IF NOT EXISTS idx_checkout_checkouts_shipper_address_id ON checkout.checkouts (shipper_address_id);

CREATE INDEX IF NOT EXISTS idx_fulfillments_fulfillments_created_by_id ON fulfillments.fulfillments (created_by_id);
CREATE INDEX IF NOT EXISTS idx_fulfillments_fulfillments_updated_by_id ON fulfillments.fulfillments (updated_by_id);
CREATE INDEX IF NOT EXISTS idx_fulfillments_methods_created_by_id ON fulfillments.methods (created_by_id);
CREATE INDEX IF NOT EXISTS idx_fulfillments_methods_updated_by_id ON fulfillments.methods (updated_by_id);

CREATE INDEX IF NOT EXISTS idx_leads_leads_created_by_id ON leads.leads (created_by_id);
CREATE INDEX IF NOT EXISTS idx_leads_leads_updated_by_id ON leads.leads (updated_by_id);

CREATE INDEX IF NOT EXISTS idx_media_emails_pdf_id ON media.emails (pdf_id);

CREATE INDEX IF NOT EXISTS idx_orders_orders_created_by_id ON orders.orders (created_by_id);
CREATE INDEX IF NOT EXISTS idx_orders_orders_updated_by_id ON orders.orders (updated_by_id);
CREATE INDEX IF NOT EXISTS idx_orders_transactions_created_by_id ON orders.transactions (created_by_id);
CREATE INDEX IF NOT EXISTS idx_orders_transactions_updated_by_id ON orders.transactions (updated_by_id);

CREATE INDEX IF NOT EXISTS idx_organizations_organizations_created_by_id ON organizations.organizations (created_by_id);
CREATE INDEX IF NOT EXISTS idx_organizations_organizations_updated_by_id ON organizations.organizations (updated_by_id);
CREATE INDEX IF NOT EXISTS idx_organizations_organizations_image_id ON organizations.organizations (image_id);

CREATE INDEX IF NOT EXISTS idx_payments_details_created_by_id ON payments.details (created_by_id);
CREATE INDEX IF NOT EXISTS idx_payments_details_updated_by_id ON payments.details (updated_by_id);
CREATE INDEX IF NOT EXISTS idx_payments_intents_created_by_id ON payments.intents (created_by_id);
CREATE INDEX IF NOT EXISTS idx_payments_intents_updated_by_id ON payments.intents (updated_by_id);
CREATE INDEX IF NOT EXISTS idx_payments_intents_user_id ON payments.intents (user_id);
CREATE INDEX IF NOT EXISTS idx_payments_methods_created_by_id ON payments.methods (created_by_id);
CREATE INDEX IF NOT EXISTS idx_payments_methods_updated_by_id ON payments.methods (updated_by_id);

CREATE INDEX IF NOT EXISTS idx_products_bullion_created_by_id ON products.bullion (created_by_id);
CREATE INDEX IF NOT EXISTS idx_products_bullion_updated_by_id ON products.bullion (updated_by_id);
CREATE INDEX IF NOT EXISTS idx_products_bullion_supplier_id ON products.bullion (supplier_id);

CREATE INDEX IF NOT EXISTS idx_rates_rates_created_by_id ON rates.rates (created_by_id);
CREATE INDEX IF NOT EXISTS idx_rates_rates_updated_by_id ON rates.rates (updated_by_id);

CREATE INDEX IF NOT EXISTS idx_reviews_reviews_created_by_id ON reviews.reviews (created_by_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviews_updated_by_id ON reviews.reviews (updated_by_id);

CREATE INDEX IF NOT EXISTS idx_shipping_services_created_by_id ON shipping.services (created_by_id);
CREATE INDEX IF NOT EXISTS idx_shipping_services_updated_by_id ON shipping.services (updated_by_id);

-- ======================================== 8. review range

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_rating_range') THEN
    ALTER TABLE reviews.reviews ADD CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5);
  END IF;
END $$;
