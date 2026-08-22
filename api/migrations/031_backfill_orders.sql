-- Populate the orders schema from exchange.
--
-- This is the transformation the whole migration exists for. exchange keeps
-- purchase orders and sales orders in two parallel tables, duplicated column
-- for column, with every query written twice. orders.orders is one table with a
-- `direction`, and the things that only one kind of order has - an offer, a
-- transaction - move to their own tables beside it rather than sitting null on
-- half the rows.
--
-- Every mapping below was checked against dev before being written, by counting
-- rows where the new column and the candidate old column disagree. That is
-- worth doing: three of the guesses were wrong. offers.status is not the order
-- status - it is unused and null throughout. transactions.funds is not
-- used_funds, which is a boolean; it is pre_charges_amount. And offers,
-- transactions and spots do not keep their source row's id, where items and
-- orders do.
--
-- The same guard as 029: this is only correct while exchange is authoritative,
-- so it refuses if the new tables already hold rows exchange does not.
--
-- exchange is only ever read.

-- Guard ---------------------------------------------------------------
DO $$
DECLARE
  offender text;
BEGIN
  SELECT string_agg(t, ', ') INTO offender FROM (
    SELECT 'orders.orders' t WHERE EXISTS (
      SELECT 1 FROM orders.orders n
      WHERE NOT EXISTS (SELECT 1 FROM exchange.purchase_orders e WHERE e.id = n.id)
        AND NOT EXISTS (SELECT 1 FROM exchange.sales_orders e WHERE e.id = n.id))
    UNION ALL SELECT 'orders.items' WHERE EXISTS (
      SELECT 1 FROM orders.items n
      WHERE NOT EXISTS (SELECT 1 FROM exchange.purchase_order_items e WHERE e.id = n.id)
        AND NOT EXISTS (SELECT 1 FROM exchange.sales_order_items e WHERE e.id = n.id))
  ) x;

  IF offender IS NOT NULL THEN
    RAISE EXCEPTION
      'refusing to backfill orders: % holds rows exchange does not, so a switch has been promoted past dual and exchange is no longer authoritative.',
      offender;
  END IF;
END $$;

-- orders ---------------------------------------------------------------
--
-- The two tables become one. `direction` is what tells them apart, and
-- (direction, number) is unique - exchange enforced that on purchase orders
-- and, for no particular reason, not on sales orders.
--
-- refinery_id is deliberately null for purchases. Every purchase order in dev
-- points at Elemetal, but exchange.purchase_orders has no supplier column and
-- refiner_metals has none either, so that is a fact recorded in January and not
-- derivable from anything here. Inventing it for every order on production
-- because it happened to be true of sixteen in dev would be a guess written
-- into the data. See FOLLOWUPS.

INSERT INTO orders.orders (
  id, user_id, refinery_id, direction, status, number, notes, review_created,
  created_by, updated_by, created_at, updated_at
)
SELECT
  p.id, p.user_id, NULL, 'purchase', p.purchase_order_status, p.order_number,
  p.notes, p.review_created, p.created_by, p.updated_by,
  p.created_at AT TIME ZONE 'UTC', p.updated_at AT TIME ZONE 'UTC'
FROM exchange.purchase_orders p
ON CONFLICT (id) DO NOTHING;

INSERT INTO orders.orders (
  id, user_id, refinery_id, direction, status, number, notes, review_created,
  created_by, updated_by, created_at, updated_at
)
SELECT
  s.id, s.user_id,
  (SELECT r.id FROM refiners.refiners r WHERE r.id = s.supplier_id),
  'sale', s.sales_order_status, s.order_number,
  s.notes, s.review_created, s.created_by, s.updated_by,
  s.created_at AT TIME ZONE 'UTC', s.updated_at AT TIME ZONE 'UTC'
FROM exchange.sales_orders s
ON CONFLICT (id) DO NOTHING;

-- offers ---------------------------------------------------------------
--
-- Only purchase orders carry an offer, which is the point of splitting it out.
-- The row gets a fresh id and points back at the order, so idempotency keys on
-- order_id rather than on a conflict target.
--
-- `status` stays null: the column exists but nothing has ever written to it,
-- in dev or anywhere the schema was copied from.

INSERT INTO orders.offers (
  order_id, offer_status, notes, spots_locked, offer_expiration,
  num_rejections, offer_amount, created_by, updated_by, created_at, updated_at
)
SELECT
  p.id, p.offer_status, p.offer_notes, p.spots_locked, p.offer_expires_at,
  p.num_rejections, p.total_price, p.created_by, p.updated_by,
  p.created_at AT TIME ZONE 'UTC', p.updated_at AT TIME ZONE 'UTC'
FROM exchange.purchase_orders p
WHERE NOT EXISTS (SELECT 1 FROM orders.offers o WHERE o.order_id = p.id);

-- transactions ----------------------------------------------------------
--
-- The money on a sales order. `funds` is pre_charges_amount - the amount paid
-- from the customer's Dorado balance - not used_funds, which is only the
-- boolean saying whether any was. refiner_fee has no column on
-- exchange.sales_orders and is zero throughout, so it takes its default.

INSERT INTO orders.transactions (
  order_id, total, items, shipping, shipping_service, surcharge, sales_tax,
  funds, refiner_fee, created_by, updated_by, created_at, updated_at
)
SELECT
  s.id, s.order_total, s.item_total, s.shipping_cost, s.shipping_service,
  s.charges_amount, s.sales_tax, s.pre_charges_amount, 0, s.created_by, s.updated_by,
  s.created_at AT TIME ZONE 'UTC', s.updated_at AT TIME ZONE 'UTC'
FROM exchange.sales_orders s
WHERE NOT EXISTS (SELECT 1 FROM orders.transactions t WHERE t.order_id = s.id);

-- items -----------------------------------------------------------------
--
-- Both kinds of line item become one table, keeping their original ids.
--
-- `confirmed` is what an admin ticks when they have checked a line against what
-- physically arrived. exchange.sales_order_items has no such column - nothing
-- is confirmed on the way out - so it takes the column's own default of false.
--
-- A purchase order item points at either a scrap row or a product; a sales
-- order item is always a product. Where it is scrap, the scrap row's weights
-- and metal are flattened into the item - exchange.scrap exists only to hold
-- them and is not an entity anyone refers to.
--
-- Four purchase order items have no quantity in exchange, and it is carried
-- across as null rather than defaulted. orders.items originally declared the
-- column NOT NULL, which forced a coalesce here and made the order read return
-- 1 where the API has always returned null; 039 relaxed it for that reason.
--
-- Where it is a product, the weights come from the product itself. Those are a
-- snapshot: the item recorded what the product weighed when it was ordered, and
-- three items in dev already disagree with the product's current purity because
-- it has been edited since. The historical value is not in exchange at all, so
-- the current product is the best available and the drift is unavoidable.

INSERT INTO orders.items (
  id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity, content,
  premium, quantity, confirmed, sales_tax_charged, unit
)
SELECT
  poi.id, poi.purchase_order_id, poi.product_id,
  coalesce(s.metal_id, pr.metal_id),
  coalesce(s.pre_melt, pr.gross), coalesce(s.post_melt, pr.content),
  coalesce(s.purity, pr.purity), coalesce(s.content, pr.content),
  poi.premium, poi.quantity, coalesce(poi.confirmed, false), 0,
  coalesce(s.gross_unit, 't oz')
FROM exchange.purchase_order_items poi
LEFT JOIN exchange.scrap s ON s.id = poi.scrap_id
LEFT JOIN exchange.products pr ON pr.id = poi.product_id
WHERE EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = poi.purchase_order_id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO orders.items (
  id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity, content,
  premium, quantity, confirmed, sales_tax_charged, unit
)
SELECT
  soi.id, soi.sales_order_id, soi.product_id, pr.metal_id,
  pr.gross, pr.content, pr.purity, pr.content,
  soi.premium, soi.quantity, false, soi.sales_tax_rate, 't oz'
FROM exchange.sales_order_items soi
JOIN exchange.products pr ON pr.id = soi.product_id
WHERE EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = soi.sales_order_id)
ON CONFLICT (id) DO NOTHING;

-- spots -----------------------------------------------------------------
--
-- The spot prices an order was quoted at, one row per order and metal.
-- exchange.order_metals names the metal as text and carries a column for each
-- kind of order; here the metal is a foreign key and there is one order id.
--
-- The rate tier applied when the order was priced comes across with them:
-- unlike the equivalent columns on exchange.metals, which rates.rates
-- supersedes, these record what was actually used and nothing else holds it.
--
-- percent_change and dollar_change do not come across. They are 100% null in
-- exchange and read by findMetalsByOrderId, which is why they have not been
-- dropped there - but there is nothing to carry, and the read can project null
-- without a column to hold it.

INSERT INTO orders.spots (
  order_id, metal_id, ask, bid,
  scrap_percentage, bullion_percentage, created_at, updated_at
)
SELECT
  coalesce(m.purchase_order_id, m.sales_order_id), mt.id, m.ask_spot, m.bid_spot,
  m.scrap_percentage, m.bullion_percentage,
  m.created_at AT TIME ZONE 'UTC', m.updated_at AT TIME ZONE 'UTC'
FROM exchange.order_metals m
JOIN metals.metals mt ON mt.name = m.type
WHERE coalesce(m.purchase_order_id, m.sales_order_id) IS NOT NULL
  AND EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = coalesce(m.purchase_order_id, m.sales_order_id))
  AND NOT EXISTS (
    SELECT 1 FROM orders.spots sp
    WHERE sp.order_id = coalesce(m.purchase_order_id, m.sales_order_id)
      AND sp.metal_id = mt.id
  );

-- addresses --------------------------------------------------------------
--
-- An order's address becomes a snapshot rather than a pointer into the user's
-- address book. Editing a saved address should not rewrite the address on a
-- package already moving, which is what the old shape allowed.
--
-- So each order gets its own row in places.addresses, even where two orders
-- share an address today. The CTE is MATERIALIZED so the generated id is
-- evaluated once and the row written is the row linked.

WITH needed AS MATERIALIZED (
  SELECT o.id AS order_id, a.id AS source_id, gen_random_uuid() AS snapshot_id
  FROM orders.orders o
  JOIN exchange.addresses a
    ON a.id = coalesce(
      (SELECT p.address_id FROM exchange.purchase_orders p WHERE p.id = o.id),
      (SELECT s.address_id FROM exchange.sales_orders s WHERE s.id = o.id)
    )
  WHERE NOT EXISTS (SELECT 1 FROM orders.addresses oa WHERE oa.order_id = o.id)
),
snapshot AS (
  INSERT INTO places.addresses (
    id, line_1, line_2, city, state, country, zip,
    country_code, phone_number, created_at, updated_at, is_valid, is_residential
  )
  SELECT
    n.snapshot_id, a.line_1, a.line_2, a.city, a.state, a.country, a.zip,
    a.country_code, a.phone_number, a.created_at, a.updated_at,
    a.is_valid, coalesce(a.is_residential, false)
  FROM needed n
  JOIN exchange.addresses a ON a.id = n.source_id
  RETURNING id
)
INSERT INTO orders.addresses (id, address_id, order_id, source_address_id)
SELECT gen_random_uuid(), n.snapshot_id, n.order_id, n.source_id
FROM needed n;
