-- Re-copy the migrated tables to restore sub-millisecond timestamp precision.
--
-- The January bulk copy moved rows through JavaScript. pg materialises a
-- timestamp as a JS Date, which holds milliseconds, so every timestamp it
-- carried across lost its microseconds: exchange holds 21:46:31.300941 where
-- the new table holds 21:46:31.300.
--
-- verify:parity caught it only after the comparison was made type-aware -
-- before that the two sides were being cast to text through different paths and
-- the difference was invisible.
--
-- The mirror functions had the same flaw and now copy server-side, so this is a
-- one-off correction rather than something that will drift again.
--
-- INSERT ... SELECT keeps everything inside Postgres, so no value is ever
-- materialised in a client. Keyed on id, so it only ever corrects rows that
-- already exist on both sides; nothing is created or removed.
--
-- sales_tax_rules is absent because neither side carries timestamp columns.

UPDATE leads.leads t
SET created_at = e.created_at, updated_at = e.updated_at,
    last_contacted = e.last_contacted
FROM exchange.leads e
WHERE t.id = e.id;

UPDATE reviews.reviews t
SET created_at = e.created_at, updated_at = e.updated_at
FROM exchange.reviews e
WHERE t.id = e.id;

UPDATE rates.rates t
SET created_at = e.created_at, updated_at = e.updated_at
FROM exchange.rates e
WHERE t.id = e.id;
