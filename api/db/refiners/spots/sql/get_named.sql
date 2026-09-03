-- The refiner's spots for an order in the CONVERTED spellings (`name`/`ask`/`bid`) — get_for.sql keeps the legacy spellings its own wire still serves; this is the same rows for callers on the converted names.
-- percent_change/dollar_change have no column in the new schema; projected as NULL to keep the shape.
SELECT
       sp.id,
       sp.order_id,
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
