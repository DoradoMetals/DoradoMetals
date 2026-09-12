-- The refiner order's one label, derived. Substituted into view_one.sql and
-- into both the projection and the WHERE of view_all.sql through
-- /*__refining_state__*/, so the label a filter matches and the label a screen
-- draws cannot drift apart. `ro` is refining.orders.
CASE WHEN ro.cancelled_at IS NOT NULL THEN 'Cancelled'
     WHEN ro.disputed_at IS NOT NULL THEN 'Disputed'
     WHEN ro.settled_at IS NOT NULL THEN 'Settled'
     WHEN ro.direction = 'buy'
          AND NOT EXISTS (SELECT 1 FROM fulfillments.arrivals a
                           WHERE a.refining_order_id = ro.id AND a.arrived)
       THEN 'Awaiting Delivery'
     WHEN ro.direction = 'buy' THEN 'Awaiting Payment'
     ELSE 'Pending assay' END
