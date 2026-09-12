-- Has the metal ARRIVED? There is no column for it (Jacob, 2026-09-12): arrival
-- is the inbound fulfillment reaching its done state, and `fulfillments.arrivals`
-- (migration 185) is where that is decided, once, for every kind. Substituted
-- into order_state.sql and the lot position expression through
-- /*__fulfillment_arrived__*/. `o` is the orders.orders row the handover belongs
-- to.
EXISTS (SELECT 1 FROM fulfillments.arrivals a
         WHERE a.order_id = o.id AND a.arrived)
