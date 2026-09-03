-- THE METAL IS A FOREIGN KEY HERE AND WAS TEXT IN exchange, so the name is
-- joined in. This is the one place a join stays in the SQL rather than moving
-- to a compose step: metals.metals is four seeded rows and the alternative is
-- threading a metal-name map through a read that has no other reason to know
-- about one.
--
-- percent_change and dollar_change HAVE NO COLUMN in the new schema and are
-- projected as NULL to keep the shape. They are null on every row in exchange
-- too and nothing writes them - CLAUDE.md lists percent_change among the
-- columns that are 100% NULL and still referenced by live code, which is
-- exactly why they are projected rather than dropped.
--
-- The spot prices an order was quoted at, frozen when the offer locked.
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
  FROM orders.spots sp
  JOIN metals.metals m ON m.id = sp.metal_id
 WHERE sp.order_id = $1
 ORDER BY m.name ASC, sp.id ASC
