-- What one line was priced at.
--
-- SCOPED ON BOTH, as exchange was: an item id alone would let a price from one
-- order land on another's line.
--
-- The price ARRIVES COMPUTED. exchange called calculateItemPrice(item, spots)
-- inside the repo, which put the pricing rules - spot, premium, content - below
-- the layer that owns them. The caller works it out and passes it, the same way
-- sales-orders' insertItems takes a `priceOf`.
UPDATE orders.items
   SET price = $1
 WHERE id = $2
   AND order_id = $3
RETURNING id, order_id, price
