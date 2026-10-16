-- Whether an order's lots have a refiner assay to adopt (R-5), as one
-- expression over the orders.orders row `o`. A lot is assayed once the
-- refiner lot it was batched into (inventory.lot_sources, kind 'batch') is
-- stamped assayed or settled. `combining_lots` counts the assayed lots that
-- share their refiner lot with another of this order's lots: adopting with
-- `combine` would merge them. Substituted into view.sql and action_facts.sql
-- so a card and the order view decide adopt_assay from one reading.
(SELECT jsonb_build_object(
          'assayed_lots', count(*),
          'combining_lots', count(*) FILTER (WHERE x.peers > 1))
   FROM (SELECT count(*) OVER (PARTITION BY ls.lot_id) AS peers
           FROM orders.lots ol
           JOIN inventory.lot_sources ls ON ls.source_lot_id = ol.lot_id AND ls.kind = 'batch'
           JOIN inventory.lots rlot ON rlot.id = ls.lot_id
          WHERE ol.order_id = o.id
            AND (rlot.assayed_at IS NOT NULL OR rlot.settled_at IS NOT NULL)) x)
