-- The refiner's spots for an order in the CONVERTED spellings (`name` /
-- `ask` / `bid`, D84) - the shape the order pipelines and the quote read
-- speak. get_for.sql keeps the legacy spellings its own wire still serves;
-- this is the same rows for callers on the converted names.
--
-- percent_change and dollar_change HAVE NO COLUMN in the new schema and are
-- projected as NULL to keep the shape - null on every exchange row too, and
-- nothing ever wrote them.
SELECT
       sp.id,
       sp.order_id AS purchase_order_id,
       m.name,
       sp.ask,
       sp.bid,
       NULL::numeric AS percent_change,
       NULL::numeric AS dollar_change,
       sp.created_at,
       sp.updated_at
  FROM refiners.spots sp
  JOIN metals.metals m ON m.id = sp.metal_id
 WHERE sp.order_id = $1
 ORDER BY m.name ASC, sp.id ASC
