-- Close two gaps the January copy left in the orders schema.
--
-- Both are rows that exist in exchange and never arrived in the new tables.
-- Nothing is lost from exchange - it holds every row it always did - but the
-- target is short, and a target that is short is not a target you can switch
-- reads to. Found by counting: orders.items held 40 rows where its two sources
-- hold 41, and 2 purchase orders carried an address_id with no address row.
--
-- Written set-based rather than against the specific ids, so it closes the same
-- gap wherever it is found and is a no-op once there is none. exchange is
-- untouched.
--
-- Gap 1: one purchase_order_item missing from orders.items.
--
-- fa902487-fd24-4a6d-9b26-fbed1b6a89cd, on order 239, status Received. An
-- order that is short a line item under-reports what the customer sent, so this
-- is not cosmetic. The mapping was derived by comparing an already-copied row
-- against its sources: the item keeps the purchase_order_item's id, takes its
-- weights and metal from the scrap row it points at, and its quantity, premium
-- and confirmed flag from the item. sales_tax_charged is 0 because a purchase
-- order is us buying, and we do not charge ourselves tax.

INSERT INTO orders.items (
  id, order_id, bullion_id, metal_id,
  pre_melt, post_melt, purity, content,
  premium, quantity, confirmed, sales_tax_charged, unit
)
SELECT
  poi.id, poi.purchase_order_id, poi.product_id, s.metal_id,
  s.pre_melt, s.post_melt, s.purity, s.content,
  poi.premium, poi.quantity, poi.confirmed, 0, s.gross_unit
FROM exchange.purchase_order_items poi
JOIN exchange.scrap s ON s.id = poi.scrap_id
LEFT JOIN orders.items i ON i.id = poi.id
WHERE i.id IS NULL
  AND EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = poi.purchase_order_id);

-- Gap 2: two purchase orders lost their address.
--
-- Orders 241 and 242, both In Transit - so both are orders we are actively
-- expecting a package for, and an order in transit with no address is the worst
-- case for this particular gap.
--
-- The new schema snapshots an order's address rather than pointing at the
-- user's address book, which is the right call: editing your saved address
-- should not rewrite the address on a package already moving. That means each
-- order needs its own row, even though these two orders share one address
-- today - which is exactly the situation the snapshot exists to handle.
--
-- The CTE is MATERIALIZED so gen_random_uuid() is evaluated once and the id
-- written into places.addresses is the same one linked from orders.addresses.

WITH missing AS MATERIALIZED (
  SELECT po.id AS order_id, po.address_id, gen_random_uuid() AS snapshot_id
  FROM exchange.purchase_orders po
  LEFT JOIN orders.addresses oa ON oa.order_id = po.id
  WHERE oa.order_id IS NULL
    AND po.address_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = po.id)
    AND EXISTS (SELECT 1 FROM places.addresses pa WHERE pa.id = po.address_id)
),
snapshot AS (
  INSERT INTO places.addresses (
    id, line_1, line_2, city, state, country, zip,
    country_code, phone_number, created_at, updated_at, is_valid, is_residential
  )
  SELECT
    m.snapshot_id, pa.line_1, pa.line_2, pa.city, pa.state, pa.country, pa.zip,
    pa.country_code, pa.phone_number, pa.created_at, pa.updated_at,
    pa.is_valid, pa.is_residential
  FROM missing m
  JOIN places.addresses pa ON pa.id = m.address_id
  RETURNING id
)
INSERT INTO orders.addresses (id, address_id, order_id)
SELECT gen_random_uuid(), m.snapshot_id, m.order_id
FROM missing m;
