-- Re-store every orders.items row so dev matches a database built from scratch.
--
-- 058 widened the columns but left the values as they were stored. Postgres
-- keeps a numeric's scale with the value, so a row written under
-- numeric(20,3) still displays as 1.000 after the type becomes unconstrained -
-- and 058's guard skipped those rows on purpose, because 1.000 and 1 are the
-- same number and `IS DISTINCT FROM` says so.
--
-- Same number, different representation, and the representation is observable:
-- verify:backfill compares as text and reported seventy differences, and anyone
-- looking at dev and a fresh production side by side in pgAdmin would see 1.000
-- against 1 and reasonably wonder which was right.
--
-- So every row is rewritten from its source unconditionally. The values do not
-- change - this is the same expression 031_backfill_orders.sql uses - only the
-- scale they carry, which becomes whatever the source column has. Cheap at
-- forty-one rows, and it makes dev reproducible from the migrations, which is
-- the property verify:backfill exists to prove.
--
-- Not guarded on equality, because equality is precisely what is being worked
-- around. Idempotent all the same: running it twice writes the same values.

UPDATE orders.items i
SET pre_melt  = coalesce(s.pre_melt,  pr.gross),
    post_melt = coalesce(s.post_melt, pr.content),
    purity    = coalesce(s.purity,    pr.purity),
    content   = coalesce(s.content,   pr.content),
    premium   = poi.premium,
    quantity  = poi.quantity
FROM exchange.purchase_order_items poi
LEFT JOIN exchange.scrap s     ON s.id  = poi.scrap_id
LEFT JOIN exchange.products pr ON pr.id = poi.product_id
WHERE poi.id = i.id;

UPDATE orders.items i
SET pre_melt  = pr.gross,
    post_melt = pr.content,
    purity    = pr.purity,
    content   = pr.content,
    premium   = soi.premium,
    quantity  = soi.quantity
FROM exchange.sales_order_items soi
JOIN exchange.products pr ON pr.id = soi.product_id
WHERE soi.id = i.id;
