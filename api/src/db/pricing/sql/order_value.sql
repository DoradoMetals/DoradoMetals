-- ONE ORDER'S ESTIMATED VALUE, as a correlated expression. $0 - it takes no
-- parameter; `o` is the orders.orders row it is substituted beside.
--
-- Ruling 75: only pricing prices, so the list's `5 lots - $18,420 est.` is
-- computed HERE and substituted into db/orders/sql/list.sql by its repo,
-- exactly the way the order state and the lot position are. It is the
-- set-returning form of order_pricing.sql's
-- `items_total` - the same content x premium x spot, the same
-- direction-aware spot (bid for a purchase, ask for a sale; the order's own
-- frozen row once it is locked, the live feed until then), the same per-unit
-- multiplication for a catalogue line - so a card and the order's own quote
-- cannot print different money.
(SELECT COALESCE(sum(
          CASE WHEN li.content IS NULL OR li.premium IS NULL THEN 0
               ELSE li.content * li.premium
                    * COALESCE(
                        CASE WHEN o.direction = 'sale'
                             THEN CASE WHEN o.spots_locked THEN COALESCE(eos.ask, esp.ask)
                                       ELSE esp.ask END
                             ELSE CASE WHEN o.spots_locked THEN COALESCE(eos.bid, esp.bid)
                                       ELSE esp.bid END END,
                        0)
                    * CASE WHEN li.bullion_id IS NULL THEN 1 ELSE li.quantity END
          END), 0)
   FROM orders.lots eol
   JOIN inventory.lots li ON li.id = eol.lot_id
   LEFT JOIN orders.spots eos ON eos.order_id = eol.order_id AND eos.metal_id = li.metal_id
   LEFT JOIN spots.spots esp ON esp.metal_id = li.metal_id
  WHERE eol.order_id = o.id)
