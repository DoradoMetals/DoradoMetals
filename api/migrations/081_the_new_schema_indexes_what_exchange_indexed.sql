-- Two access paths that exchange indexes and the schema replacing it does not.
--
-- Found by audit:indexes, which is the half of the index comparison nothing was
-- doing: audit:constraints reads pg_index but filters on indisunique, so plain
-- indexes had never been looked at. The question it asks is not whether
-- uniqueness survives - that one is audit:constraints' and it already reports
-- eight - but whether the ACCESS PATH survives. btree is only enterable on a
-- leading prefix, so if no index in the target LEADS with the column the source
-- index leads with, the lookup has no index at all.
--
-- Nothing downstream can catch this. diff compares output, not plans.
-- verify:parity compares rows. validate:wire compares shapes. All three pass
-- against a table with no indexes whatsoever. The only symptom is latency, and
-- dev holds tens of rows where a sequential scan is genuinely the faster plan -
-- so dev cannot produce the symptom either. It would first appear as production
-- row counts arriving at a schema nobody had measured, on the day a *_SOURCE
-- switch moved.
--
-- Both of these are additive. An index cannot lose a row: CREATE UNIQUE INDEX
-- either succeeds or refuses, and tax.sales_tax was checked first - 51 rows,
-- 51 non-null states, 0 duplicates.
--
-- The audit reports three more (products.bullion.supplier_id,
-- orders.orders.number, payments.*.provider_ref). They are NOT fixed here,
-- because each was checked against the queries that actually run and none is a
-- live access path - supplier_id is only ever joined FROM bullion to refiners'
-- primary key, nothing looks an order up by number alone, and provider_ref is
-- always paired with the indexed intent_id. They are named in the audit's
-- ACCEPTED list with those reasons rather than indexed on speculation, because
-- an index nothing reads still costs every write.

-- media: getUserImages is `WHERE user_id = $1 ORDER BY created_at DESC, id DESC`
-- and media.images' only non-primary index is UNIQUE (path, filename, user_id),
-- which leads with `path` and cannot serve it. exchange has a purpose-built
-- (user_id, created_at) - the misspelling in `imges_user_created_idx` is a fair
-- sign it was added the day somebody noticed. MEDIA_WIRE is the one switch
-- audit:wire-readiness reports as clear to move, which makes media the likeliest
-- feature to be promoted first.
CREATE INDEX IF NOT EXISTS idx_images_user_created
  ON media.images (user_id, created_at);

-- tax: both live queries in features/sales-tax/repo.next.ts key on state -
-- isNexus(state) decides whether a checkout is charged sales tax at all, and
-- updateStateSalesTax(amount, state) is an UPDATE ... WHERE state = $2. UNIQUE
-- rather than plain because exchange.state_sales_tax has
-- state_sales_tax_state_key and updateStateSalesTax' correctness depends on it:
-- without one-row-per-state that UPDATE silently increments every duplicate.
-- This also closes one of the eight gaps audit:constraints reports.
CREATE UNIQUE INDEX IF NOT EXISTS sales_tax_state_key
  ON tax.sales_tax (state);
