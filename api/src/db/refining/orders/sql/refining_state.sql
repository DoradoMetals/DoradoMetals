-- The refiner order's one label, derived. Substituted into view_one.sql and
-- into both the projection and the WHERE of view_all.sql, and into the lot
-- detail's refining card, through /*__refining_state__*/, so the label a
-- filter matches and the label a screen draws cannot drift apart. `ro` is
-- refining.orders.
--
-- Title Case throughout (statuses.md section 3): `Pending Assay`, not
-- `Pending assay`. One vocabulary, one casing, one OrderState enum.
--
-- `Draft` is the first non-terminal rung: an order nobody has sent is a draft,
-- whichever way it points. Before this a sell order read `Pending assay` and a
-- buy order `Awaiting Delivery` while the refiner had not been told the metal
-- exists.
CASE WHEN ro.cancelled_at IS NOT NULL THEN 'Cancelled'
     WHEN ro.disputed_at IS NOT NULL THEN 'Disputed'
     WHEN ro.settled_at IS NOT NULL THEN 'Settled'
     WHEN ro.sent_at IS NULL THEN 'Draft'
     WHEN ro.direction = 'buy'
          AND NOT EXISTS (SELECT 1 FROM fulfillments.arrivals a
                           WHERE a.refining_order_id = ro.id AND a.arrived)
       THEN 'Awaiting Delivery'
     WHEN ro.direction = 'buy' THEN 'Awaiting Payment'
     ELSE 'Pending Assay' END
