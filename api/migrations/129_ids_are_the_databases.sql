-- RULING 72 (Jacob, verbatim): "The database will create ids. WE SHOULD NEVER
-- CREATE UUIDS ON THE API OR FRONTEND."
--
-- The naive measurement that opened this work - every uuid column literally
-- named id with no column_default, outside exchange/auth - returned four
-- hits: metals.exchange_compat, products.mints_exchange_compat,
-- refiners.exchange_compat, shipping.carriers_exchange_compat. All four are
-- VIEWS (relkind 'v'), not tables: read-only reassembly projections that give
-- verify:parity something to compare exchange's old shape against once a
-- table split across several new ones (017, 021, 022, 027 say so in their own
-- headers - "Read-only. Nothing writes through it."). A view carries no
-- INSERT of its own to default, and grep confirms nothing in api/ ever writes
-- one - the only readers are verify:parity, verify:backfill and
-- compare-tables.mjs. ALTER TABLE ... ALTER COLUMN ... SET DEFAULT on one of
-- these views is accepted by Postgres (views may carry column-default
-- metadata) but does nothing real, because none of the four is
-- auto-updatable - a multi-table join has no INSERT to apply a default to.
-- Running it would be ceremony, not a fix.
--
-- MEASURED PROPERLY (2026-09-04): every PRIMARY KEY column of type uuid on an
-- actual base table (relkind 'r') outside exchange/auth - the query below,
-- not the column-name-shaped one above - is 45 tables, all named id, all
-- already DEFAULT gen_random_uuid(). Zero gaps. The structural half of ruling
-- 72 was already satisfied before this migration; there was nothing to ALTER.
--
-- What was not yet true is a permanent guard saying so. This migration adds
-- one: it re-runs the same relkind-aware check as a DO block and refuses to
-- apply if a future table ever ships a uuid primary key with no default,
-- so the gap this measurement closed cannot reopen silently. It touches no
-- exchange object and drops or alters nothing.
--
-- The application-code half of ruling 72 - deleting every randomUUID() call
-- site that minted a row's own id, and the repos and SQL that accepted one -
-- is not a schema change and has no migration; it is the rest of this wave.

DO $$
DECLARE
  gaps int;
BEGIN
  SELECT count(*) INTO gaps
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(con.conkey)
    LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
   WHERE con.contype = 'p'
     AND c.relkind = 'r'
     AND n.nspname NOT IN ('exchange', 'auth')
     AND format_type(a.atttypid, a.atttypmod) = 'uuid'
     AND ad.adbin IS NULL;

  IF gaps > 0 THEN
    RAISE EXCEPTION
      'ruling 72: % uuid primary key column(s) outside exchange/auth have no '
      'database default - a table shaped like this forces application code '
      'to mint its own id to insert a row at all. Add '
      'DEFAULT gen_random_uuid() to the column before this table reaches '
      'any repo.', gaps;
  END IF;
END $$;
