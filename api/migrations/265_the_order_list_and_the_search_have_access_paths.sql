-- EVERY NEW WHERE GETS AN INDEX.
--
-- The order list gained `state`, `assigned_to_id`, `has_unassigned_lots`,
-- `sort` and pagination, and `GET /api/search` reads four tables by prefix.
-- `assigned_to_id` already had `orders_assigned`; these are the paths that had
-- none.
--
-- The search matches a PREFIX - `lower(col) LIKE lower($1) || '%'` - because a
-- prefix is what a header search box types and because a prefix is the only
-- pattern a btree can enter by. `text_pattern_ops` is what makes that true:
-- the default opclass orders by collation and a LIKE prefix cannot use it. No
-- extension is added; `pg_trgm` would buy infix matching at the cost of an
-- extension this database does not have and cannot be given from a migration
-- run by the application role.
--
-- Purely additive. `exchange` is neither read nor written.

CREATE INDEX IF NOT EXISTS orders_newest
  ON orders.orders (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS orders_number_prefix
  ON orders.orders (((number)::text) text_pattern_ops);

CREATE INDEX IF NOT EXISTS users_name_prefix
  ON auth.users (lower(name) text_pattern_ops);

CREATE INDEX IF NOT EXISTS users_email_prefix
  ON auth.users (lower(email) text_pattern_ops);

CREATE INDEX IF NOT EXISTS leads_name_prefix
  ON leads.leads (lower(name) text_pattern_ops);

CREATE INDEX IF NOT EXISTS leads_number_prefix
  ON leads.leads (lower(number) text_pattern_ops);

CREATE INDEX IF NOT EXISTS bullion_name_prefix
  ON products.bullion (lower(name) text_pattern_ops);
