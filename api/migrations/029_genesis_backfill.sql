-- Populate the new schema from exchange.
--
-- 000 creates the tables and leaves them empty. On a database that has never
-- had the January branch - which is to say production - that is where things
-- stop: the schema exists and holds nothing, and the per-feature backfills are
-- inside 000's baseline range, so they are recorded rather than run. This is
-- what actually moves the data across.
--
-- Scope: the eleven features whose repos have been split and verified. The rest
-- still read exchange, so their new tables being empty costs nothing, and
-- filling them would mean committing to transformations that have not been
-- checked against a diff yet. They are listed at the bottom.
--
-- Two properties this has to have.
--
-- Idempotent. Every insert is ON CONFLICT DO NOTHING, so re-running adds what
-- is missing and changes nothing that is there. It never updates an existing
-- row - a backfill that overwrites is how you lose a write that arrived while
-- you were not looking.
--
-- Refuses when it is no longer safe. A backfill is only correct while exchange
-- is authoritative. Once a *_SOURCE switch is promoted past `dual` the new
-- schema starts taking rows exchange will never see, and re-running would leave
-- those rows sitting beside stale copies of everything else. Rather than read a
-- switch - which lives in the API's environment, not the database's - the guard
-- below tests the condition the switch would cause: a row in a new table whose
-- id is not in the table it came from. That is the thing that makes a backfill
-- unsafe, and it is visible from here.
--
-- exchange is only ever read.

-- Guard ---------------------------------------------------------------
DO $$
DECLARE
  offender text;
BEGIN
  SELECT string_agg(t, ', ') INTO offender FROM (
    SELECT 'leads.leads' t WHERE EXISTS (SELECT 1 FROM leads.leads n WHERE NOT EXISTS (SELECT 1 FROM exchange.leads e WHERE e.id = n.id))
    UNION ALL SELECT 'rates.rates' WHERE EXISTS (SELECT 1 FROM rates.rates n WHERE NOT EXISTS (SELECT 1 FROM exchange.rates e WHERE e.id = n.id))
    UNION ALL SELECT 'reviews.reviews' WHERE EXISTS (SELECT 1 FROM reviews.reviews n WHERE NOT EXISTS (SELECT 1 FROM exchange.reviews e WHERE e.id = n.id))
    UNION ALL SELECT 'metals.metals' WHERE EXISTS (SELECT 1 FROM metals.metals n WHERE NOT EXISTS (SELECT 1 FROM exchange.metals e WHERE e.id = n.id))
    UNION ALL SELECT 'media.images' WHERE EXISTS (SELECT 1 FROM media.images n WHERE NOT EXISTS (SELECT 1 FROM exchange.images e WHERE e.id = n.id))
    UNION ALL SELECT 'products.bullion' WHERE EXISTS (SELECT 1 FROM products.bullion n WHERE NOT EXISTS (SELECT 1 FROM exchange.products e WHERE e.id = n.id))
    UNION ALL SELECT 'products.mints' WHERE EXISTS (SELECT 1 FROM products.mints n WHERE NOT EXISTS (SELECT 1 FROM exchange.mints e WHERE e.id = n.id))
    UNION ALL SELECT 'refiners.refiners' WHERE EXISTS (SELECT 1 FROM refiners.refiners n WHERE NOT EXISTS (SELECT 1 FROM exchange.suppliers e WHERE e.id = n.id))
    UNION ALL SELECT 'shipping.carriers' WHERE EXISTS (SELECT 1 FROM shipping.carriers n WHERE NOT EXISTS (SELECT 1 FROM exchange.carriers e WHERE e.id = n.id))
    UNION ALL SELECT 'tax.sales_tax_rules' WHERE EXISTS (SELECT 1 FROM tax.sales_tax_rules n WHERE NOT EXISTS (SELECT 1 FROM exchange.sales_tax_rules e WHERE e.id = n.id))
    UNION ALL SELECT 'tax.sales_tax' WHERE EXISTS (SELECT 1 FROM tax.sales_tax n WHERE NOT EXISTS (SELECT 1 FROM exchange.state_sales_tax e WHERE e.id = n.id))
  ) x;

  IF offender IS NOT NULL THEN
    RAISE EXCEPTION
      'refusing to backfill: % holds rows exchange does not, so a switch has been promoted past dual and exchange is no longer authoritative. Re-running would leave those rows beside stale copies of everything else.',
      offender;
  END IF;
END $$;

-- users ----------------------------------------------------------------
--
-- auth.users is not a migrated feature - nothing reads it yet - but almost
-- everything below has a foreign key into it. Audit ids, media.images.user_id,
-- reviews.user_id: all of them resolve to null against an empty table, which
-- would mean a production backfill that silently drops every attribution it
-- has. So the users come across first.
--
-- A straight copy. auth.users adds phone_number, which exchange has no column
-- for and which stays null.
--
-- Deliberately not in the guard above: dev's auth.users holds two test accounts
-- created directly in the new schema, so it legitimately has rows exchange does
-- not, and that says nothing about whether a switch has been promoted.

INSERT INTO auth.users (
  id, email, name, "createdAt", "updatedAt", "emailVerified", image, role,
  "stripeCustomerId", dorado_funds, banned, "banReason", "banExpires"
)
SELECT
  e.id, e.email, e.name, e."createdAt", e."updatedAt", e."emailVerified",
  e.image, e.role, e."stripeCustomerId", e.dorado_funds, e.banned,
  e."banReason", e."banExpires"
FROM exchange.users e
ON CONFLICT (id) DO NOTHING;

-- metals ---------------------------------------------------------------
--
-- exchange.metals is two things in one row: the metal, and the current spot
-- quote for it. They separate here. `type` becomes `name`, because on a table
-- called metals the column is the metal's name.

INSERT INTO metals.metals (id, name)
SELECT e.id, e.type FROM exchange.metals e
ON CONFLICT (id) DO NOTHING;

-- The quote half. One row per metal, which the unique index enforces, so the
-- conflict target is metal_id rather than the generated id. exchange.metals
-- carries no timestamp, so updated_at takes its default.

INSERT INTO spots.spots (metal_id, ask, bid, percent_change, dollar_change)
SELECT e.id, e.ask_spot, e.bid_spot, e.percent_change, e.dollar_change
FROM exchange.metals e
ON CONFLICT (metal_id) DO NOTHING;

-- media ----------------------------------------------------------------
--
-- checksum_sha256 loses the suffix - the column is on a table called images and
-- the algorithm is not part of what it is. user_id is only carried across when
-- the user exists: auth.users is not migrated yet, so on a fresh database it is
-- empty and the foreign key would otherwise fail.

INSERT INTO media.images (
  id, bucket, mime_type, size_bytes, width, height, checksum, metadata,
  path, filename, user_id, created_at
)
SELECT
  e.id, e.bucket, e.mime_type, e.size_bytes, e.width, e.height,
  e.checksum_sha256, e.metadata, e.path, e.filename,
  (SELECT u.id FROM auth.users u WHERE u.id = e.user_id),
  e.created_at
FROM exchange.images e
WHERE e.path IS NOT NULL AND e.filename IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- organizations --------------------------------------------------------
--
-- Suppliers, carriers and mints are all organizations, and in the new schema
-- they are one table with a type. Unlike everywhere else these rows get fresh
-- ids - an organization is not the same object as the supplier - so idempotency
-- keys on (type, name), which has a unique index, rather than on the id.
--
-- The children below then find their organization by that same natural key.
--
-- A REFINER's contact details are the supplier's; a MINT's description and
-- website are the mint's, which is where they belong once a mint is an
-- organization. Naive timestamps are read as UTC, which is what they are.

INSERT INTO organizations.organizations (type, name, email, phone, enabled, created_at, updated_at)
SELECT 'REFINER', s.name, s.email, s.phone, s.is_active,
       s.created_at AT TIME ZONE 'UTC', s.updated_at AT TIME ZONE 'UTC'
FROM exchange.suppliers s
ON CONFLICT (type, name) DO NOTHING;

INSERT INTO organizations.organizations (type, name, email, phone, enabled, created_at, updated_at)
SELECT 'CARRIER', c.name, c.email, c.phone, c.is_active, c.created_at, c.updated_at
FROM exchange.carriers c
ON CONFLICT (type, name) DO NOTHING;

INSERT INTO organizations.organizations (type, name, description, website, enabled, created_at, updated_at)
SELECT 'MINT', m.name, m.description, m.website, true,
       m.created_at AT TIME ZONE 'UTC', m.updated_at AT TIME ZONE 'UTC'
FROM exchange.mints m
ON CONFLICT (type, name) DO NOTHING;

-- The organization-shaped children. Each keeps the id its source row had, so
-- everything already pointing at a supplier, carrier or mint still resolves.

INSERT INTO refiners.refiners (id, logo, organization_id)
SELECT s.id, s.logo, o.id
FROM exchange.suppliers s
JOIN organizations.organizations o ON o.type = 'REFINER' AND o.name = s.name
ON CONFLICT (id) DO NOTHING;

INSERT INTO shipping.carriers (id, logo, organization_id)
SELECT c.id, c.logo, o.id
FROM exchange.carriers c
JOIN organizations.organizations o ON o.type = 'CARRIER' AND o.name = c.name
ON CONFLICT (id) DO NOTHING;

INSERT INTO products.mints (id, name, type, country, organization_id, created_at, updated_at)
SELECT m.id, m.name, m.type, m.country, o.id,
       m.created_at AT TIME ZONE 'UTC', m.updated_at AT TIME ZONE 'UTC'
FROM exchange.mints m
JOIN organizations.organizations o ON o.type = 'MINT' AND o.name = m.name
ON CONFLICT (id) DO NOTHING;

-- products -------------------------------------------------------------
--
-- The three renamed columns: product_name, product_description and
-- product_type lose a prefix that a table called bullion makes redundant.

INSERT INTO products.bullion (
  id, metal_id, mint_id, supplier_id, name, description, type,
  bid_premium, ask_premium, display, homepage_display,
  legal_tender, domestic_tender, is_generic, content, gross, purity,
  variant_group, variant_label, shadow_offset, slug, filter_category,
  image_front, image_back,
  created_by, updated_by, created_by_id, updated_by_id, created_at, updated_at
)
SELECT
  e.id, e.metal_id, e.mint_id, e.supplier_id, e.product_name,
  e.product_description, e.product_type,
  e.bid_premium, e.ask_premium, e.display, e.homepage_display,
  e.legal_tender, e.domestic_tender, e.is_generic, e.content, e.gross, e.purity,
  e.variant_group, e.variant_label, e.shadow_offset, e.slug, e.filter_category,
  e.image_front, e.image_back,
  e.created_by, e.updated_by,
  (SELECT u.id FROM auth.users u WHERE u.id = CASE WHEN e.created_by IS NULL THEN NULL
     WHEN e.created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
     ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END),
  (SELECT u.id FROM auth.users u WHERE u.id = CASE WHEN e.updated_by IS NULL THEN NULL
     WHEN e.updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
     ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END),
  e.created_at AT TIME ZONE 'UTC', e.updated_at AT TIME ZONE 'UTC'
FROM exchange.products e
ON CONFLICT (id) DO NOTHING;

-- leads, rates, reviews -------------------------------------------------
--
-- Straight copies apart from the audit ids, which map a name to a user the way
-- migration 011 did, and only when that user exists.

INSERT INTO leads.leads (
  id, name, phone, email, created_at, updated_at, last_contacted,
  converted, contacted, responded, created_by, updated_by, notes, contact,
  priority, created_by_id, updated_by_id
)
SELECT
  e.id, e.name, e.phone, e.email, e.created_at, e.updated_at, e.last_contacted,
  e.converted, e.contacted, e.responded, e.created_by, e.updated_by, e.notes,
  e.contact, e.priority,
  (SELECT u.id FROM auth.users u WHERE u.id = CASE WHEN e.created_by IS NULL THEN NULL
     WHEN e.created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
     ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END),
  (SELECT u.id FROM auth.users u WHERE u.id = CASE WHEN e.updated_by IS NULL THEN NULL
     WHEN e.updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
     ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END)
FROM exchange.leads e
ON CONFLICT (id) DO NOTHING;

INSERT INTO rates.rates (
  id, metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct,
  created_at, updated_at, created_by, updated_by, created_by_id, updated_by_id
)
SELECT
  e.id, e.metal_id, e.unit, e.min_qty, e.max_qty, e.scrap_pct, e.bullion_pct,
  e.created_at, e.updated_at, e.created_by, e.updated_by,
  (SELECT u.id FROM auth.users u WHERE u.id = CASE WHEN e.created_by IS NULL THEN NULL
     WHEN e.created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
     ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END),
  (SELECT u.id FROM auth.users u WHERE u.id = CASE WHEN e.updated_by IS NULL THEN NULL
     WHEN e.updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
     ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END)
FROM exchange.rates e
ON CONFLICT (id) DO NOTHING;

-- reviews gains a user_id exchange never had. There is no key to derive it
-- from - exchange.reviews holds a name and nothing else - so it is matched by
-- name, and only when exactly one user has that name.
--
-- In practice that means it stays null, because exchange.users contains two
-- accounts named Jacob Johnson and every review in dev is his. dev has these
-- populated from January, when presumably only one existed; that value cannot
-- be reproduced from exchange now, and guessing between two accounts is worse
-- than leaving the review unattributed. See FOLLOWUPS.

INSERT INTO reviews.reviews (
  id, user_id, name, review_text, rating, hidden,
  created_at, updated_at, created_by, updated_by, created_by_id, updated_by_id
)
SELECT
  e.id,
  (SELECT u.id FROM auth.users u
    WHERE u.name = e.name
      AND (SELECT count(*) FROM auth.users x WHERE x.name = e.name) = 1),
  e.name, e.review_text, e.rating, e.hidden,
  e.created_at AT TIME ZONE 'UTC', e.updated_at AT TIME ZONE 'UTC',
  e.created_by, e.updated_by,
  (SELECT u.id FROM auth.users u WHERE u.id = CASE WHEN e.created_by IS NULL THEN NULL
     WHEN e.created_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
     ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END),
  (SELECT u.id FROM auth.users u WHERE u.id = CASE WHEN e.updated_by IS NULL THEN NULL
     WHEN e.updated_by = 'Pedro Gonzalez' THEN '3a4fffbb-448b-4940-ba6f-640db4c75213'::uuid
     ELSE '8153712b-5477-4a97-86f9-08b0e65ad3f6'::uuid END)
FROM exchange.reviews e
ON CONFLICT (id) DO NOTHING;

-- sales tax ------------------------------------------------------------
--
-- Both are straight copies, except that metal_category and product_type are
-- enums and exchange has its own types of the same names. Same labels, distinct
-- types as far as Postgres is concerned, so the values go through text.

INSERT INTO tax.sales_tax_rules (
  id, state_code, metal_category, product_type, min_price, max_price,
  purity_min, purity_max, aggregate_min, aggregate_max,
  markup_min_pct, markup_max_pct, tax_rate, weight_min, weight_max,
  is_domestic, is_legal_tender
)
SELECT
  e.id, e.state_code,
  e.metal_category::text::tax.sales_tax_metal_category,
  e.product_type::text::tax.sales_tax_product_type,
  e.min_price, e.max_price,
  e.purity_min, e.purity_max, e.aggregate_min, e.aggregate_max,
  e.markup_min_pct, e.markup_max_pct, e.tax_rate, e.weight_min, e.weight_max,
  e.is_domestic, e.is_legal_tender
FROM exchange.sales_tax_rules e
ON CONFLICT (id) DO NOTHING;

INSERT INTO tax.sales_tax (id, state, reached_nexus, amount_owed, last_remitted)
SELECT e.id, e.state, e.reached_nexus, e.amount_owed, e.last_remitted
FROM exchange.state_sales_tax e
ON CONFLICT (id) DO NOTHING;

-- Not backfilled here ---------------------------------------------------
--
-- orders, payments, fulfillments, shipping.shipments/tracking/pickups,
-- places, auth and the refiners item/spot tables. Their features still read
-- exchange, so an empty table costs nothing, and each needs transformation work
-- that has not been checked against a read-for-read diff yet. Backfilling on a
-- guess is how the January copy came to be quietly missing rows.
--
-- Also not backfilled: the reference data that has no source in exchange at all
-- - the DORADO organization, fulfillments.methods, payments.methods,
-- places.locations and location_hours, shipping.services and packages. Those are
-- new facts about the business, not a reshaping of old ones, and they need
-- seeding as literal values rather than deriving. See FOLLOWUPS.
