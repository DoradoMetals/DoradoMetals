-- Metal is a foreign key here (text in exchange), so the name is joined in — the one place a join stays in SQL rather than a compose step, since metals.metals is four rows.
-- percent_change/dollar_change have no column in the new schema; projected as NULL to keep the shape (100% NULL in exchange too, still referenced by live code — see CLAUDE.md).
SELECT
       sp.id,
       sp.order_id,
       m.name AS type,
       sp.ask AS ask_spot,
       sp.bid AS bid_spot,
       NULL::numeric AS percent_change,
       NULL::numeric AS dollar_change,
       sp.created_at,
       sp.updated_at
  FROM refiners.spots sp
  JOIN metals.metals m ON m.id = sp.metal_id
 WHERE sp.order_id = $1
 ORDER BY m.name ASC, sp.id ASC
